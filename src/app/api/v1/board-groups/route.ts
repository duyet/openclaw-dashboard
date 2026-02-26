export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardGroups } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/board-groups
 * List board groups for the active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(boardGroups)
      .where(eq(boardGroups.organizationId, actor.orgId))
      .orderBy(sql`lower(${boardGroups.name}) asc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardGroups)
      .where(eq(boardGroups.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/board-groups
 * Create a board group.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = ((body.name as string) || "").trim();
    if (!name) throw new ApiError(422, "Board group name is required");

    const slug = ((body.slug as string) || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const now = new Date().toISOString();
    const groupId = crypto.randomUUID();

    await db.insert(boardGroups).values({
      id: groupId,
      organizationId: actor.orgId,
      name,
      slug,
      description: (body.description as string) || null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(boardGroups)
      .where(eq(boardGroups.id, groupId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
