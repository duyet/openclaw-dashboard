export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardWebhookPayloads, boardWebhooks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/boards/:boardId/webhooks/:webhookId/payloads
 * List received payloads for a specific webhook.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string; webhookId: string }> }
) {
  try {
    const { boardId, webhookId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    // Verify webhook exists
    const webhook = await db
      .select({ id: boardWebhooks.id })
      .from(boardWebhooks)
      .where(
        and(eq(boardWebhooks.id, webhookId), eq(boardWebhooks.boardId, boardId))
      )
      .limit(1);

    if (webhook.length === 0) {
      throw new ApiError(404, "Webhook not found");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(boardWebhookPayloads)
      .where(
        and(
          eq(boardWebhookPayloads.webhookId, webhookId),
          eq(boardWebhookPayloads.boardId, boardId)
        )
      )
      .orderBy(sql`${boardWebhookPayloads.receivedAt} desc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardWebhookPayloads)
      .where(
        and(
          eq(boardWebhookPayloads.webhookId, webhookId),
          eq(boardWebhookPayloads.boardId, boardId)
        )
      );

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}
