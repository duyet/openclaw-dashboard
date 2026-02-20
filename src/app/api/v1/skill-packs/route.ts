export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { skillPacks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/skill-packs
 * List skill packs for the active organization.
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
      .from(skillPacks)
      .where(eq(skillPacks.organizationId, actor.orgId))
      .orderBy(sql`${skillPacks.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(skillPacks)
      .where(eq(skillPacks.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/skill-packs
 * Create a skill pack.
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
    if (!name) {
      throw new ApiError(422, "Skill pack name is required");
    }

    const sourceUrl = ((body.source_url as string) || "").trim();
    if (!sourceUrl) {
      throw new ApiError(422, "source_url is required");
    }

    const now = new Date().toISOString();
    const packId = crypto.randomUUID();

    await db.insert(skillPacks).values({
      id: packId,
      organizationId: actor.orgId,
      name,
      description: (body.description as string) || null,
      sourceUrl,
      branch: (body.branch as string) || "main",
      metadata: body.metadata
        ? (body.metadata as Record<string, unknown>)
        : ({} as Record<string, unknown>),
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(skillPacks)
      .where(eq(skillPacks.id, packId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
