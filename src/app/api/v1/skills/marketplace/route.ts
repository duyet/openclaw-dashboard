export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { marketplaceSkills } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/skills/marketplace
 * List marketplace skills for the active organization.
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
      .from(marketplaceSkills)
      .where(eq(marketplaceSkills.organizationId, actor.orgId))
      .orderBy(sql`lower(${marketplaceSkills.name}) asc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketplaceSkills)
      .where(eq(marketplaceSkills.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(result, {
      headers: {
        "X-Total-Count": String(total),
        "Access-Control-Expose-Headers": "X-Total-Count",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/skills/marketplace
 * Create a marketplace skill.
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
    if (!body.name) throw new ApiError(422, "Skill name is required");
    if (!body.source_url) throw new ApiError(422, "source_url is required");

    const now = new Date().toISOString();
    const skillId = crypto.randomUUID();

    await db.insert(marketplaceSkills).values({
      id: skillId,
      organizationId: actor.orgId,
      name: body.name as string,
      description: (body.description as string) || null,
      category: (body.category as string) || null,
      risk: (body.risk as string) || null,
      source: (body.source as string) || null,
      sourceUrl: body.source_url as string,
      metadata: body.metadata
        ? (body.metadata as Record<string, unknown>)
        : ({} as Record<string, unknown>),
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(marketplaceSkills)
      .where(eq(marketplaceSkills.id, skillId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
