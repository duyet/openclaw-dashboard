export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/gateways
 * List gateways for the caller's organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(gateways)
      .where(eq(gateways.organizationId, actor.orgId))
      .orderBy(sql`${gateways.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(gateways)
      .where(eq(gateways.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/gateways
 * Create a gateway in the active organization.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = ((body.name as string) || "").trim();
    if (!name) throw new ApiError(422, "Gateway name is required");
    if (!body.url) throw new ApiError(422, "Gateway URL is required");
    if (!body.workspace_root)
      throw new ApiError(422, "workspace_root is required");

    const now = new Date().toISOString();
    const gatewayId = crypto.randomUUID();

    await db.insert(gateways).values({
      id: gatewayId,
      organizationId: actor.orgId,
      name,
      url: body.url as string,
      token: (body.token as string) || null,
      workspaceRoot: body.workspace_root as string,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
