export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/tags
 * List tags for the active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(tags)
      .where(eq(tags.organizationId, actor.orgId))
      .orderBy(sql`lower(${tags.name}) asc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tags)
      .where(eq(tags.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/tags
 * Create a tag within the active organization.
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
      throw new ApiError(422, "Tag name is required");
    }

    const slug = ((body.slug as string) || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check slug uniqueness
    const existing = await db
      .select()
      .from(tags)
      .where(and(eq(tags.organizationId, actor.orgId), eq(tags.slug, slug)))
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, "Tag slug already exists in this organization");
    }

    const now = new Date().toISOString();
    const tagId = crypto.randomUUID();

    await db.insert(tags).values({
      id: tagId,
      organizationId: actor.orgId,
      name,
      slug,
      color: (body.color as string) || "9e9e9e",
      description: (body.description as string) || null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
