export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, boards, boardWebhooks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

function webhookEndpointPath(boardId: string, webhookId: string): string {
  return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
}

/**
 * GET /api/v1/boards/[boardId]/webhooks
 * List configured webhooks for a board.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { boardId } = await params;

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(boardWebhooks)
      .where(eq(boardWebhooks.boardId, boardId))
      .orderBy(sql`${boardWebhooks.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    const enriched = result.map((wh) => ({
      ...wh,
      endpoint_path: webhookEndpointPath(boardId, wh.id),
    }));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardWebhooks)
      .where(eq(boardWebhooks.boardId, boardId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(enriched, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/webhooks
 * Create a new board webhook.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { boardId } = await params;

    // Verify board exists
    const boardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!boardResult.length) {
      throw new ApiError(404, "Board not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const description = ((body.description as string) || "").trim();
    if (!description) {
      throw new ApiError(422, "Description is required");
    }

    const agentId = (body.agent_id as string) || null;

    // Validate agent_id if provided
    if (agentId) {
      const agentResult = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.boardId, boardId)))
        .limit(1);

      if (!agentResult.length) {
        throw new ApiError(
          422,
          "agent_id must reference an agent on this board."
        );
      }
    }

    const now = new Date().toISOString();
    const webhookId = crypto.randomUUID();

    await db.insert(boardWebhooks).values({
      id: webhookId,
      boardId,
      agentId,
      description,
      enabled: (body.enabled as boolean) ?? true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(boardWebhooks)
      .where(eq(boardWebhooks.id, webhookId))
      .limit(1);

    const webhook = result[0];

    return Response.json(
      {
        ...webhook,
        endpoint_path: webhookEndpointPath(boardId, webhook.id),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
