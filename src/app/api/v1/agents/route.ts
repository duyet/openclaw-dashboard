export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { generateAgentToken, hashAgentToken } from "@/lib/auth/agent";
import { getDb } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/agents
 * List agents visible to the active organization admin.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const _actor = await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const boardId = url.searchParams.get("board_id");
    const gatewayId = url.searchParams.get("gateway_id");

    let result = await db.select().from(agents).limit(limit).offset(offset);

    // Apply filters
    if (boardId) {
      result = result.filter((a) => a.boardId === boardId);
    }
    if (gatewayId) {
      result = result.filter((a) => a.gatewayId === gatewayId);
    }

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(agents);

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/agents
 * Create and provision an agent.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const _actor = await requireActorContext(request, env.DB);

    const body = (await request.json()) as Record<string, unknown>;
    const name = ((body.name as string) || "").trim();
    if (!name) {
      throw new ApiError(422, "Agent name is required");
    }
    if (!body.gateway_id) {
      throw new ApiError(422, "gateway_id is required");
    }

    const now = new Date().toISOString();
    const agentId = crypto.randomUUID();

    // Generate agent token
    const token = generateAgentToken();
    const tokenHash = await hashAgentToken(token);

    await db.insert(agents).values({
      boardId: (body.board_id as string) || null,
      gatewayId: body.gateway_id as string,
      name,
      status: "provisioning",
      agentTokenHash: tokenHash,
      heartbeatConfig: body.heartbeat_config
        ? (body.heartbeat_config as Record<string, unknown>)
        : null,
      identityProfile: body.identity_profile
        ? (body.identity_profile as Record<string, unknown>)
        : null,
      identityTemplate: (body.identity_template as string) || null,
      soulTemplate: (body.soul_template as string) || null,
      isBoardLead: (body.is_board_lead as boolean) ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    // Include the plaintext token in the creation response only
    const agentData = { ...result[0], agent_token: token };

    return Response.json(agentData, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
