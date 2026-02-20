export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/organizations
 * List organizations the current user belongs to.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      })
      .from(organizations)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.organizationId, organizations.id)
      )
      .where(eq(organizationMembers.userId, actor.userId))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, actor.userId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/organizations
 * Create a new organization and assign the caller as owner.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = ((body.name as string) || "").trim();

    if (!name) {
      throw new ApiError(422, "Organization name is required");
    }

    // Check for existing org with same name
    const existing = await db
      .select()
      .from(organizations)
      .where(sql`lower(${organizations.name}) = lower(${name})`)
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, "Organization with this name already exists");
    }

    const now = new Date().toISOString();
    const orgId = crypto.randomUUID();

    await db.insert(organizations).values({
      id: orgId,
      name,
      createdAt: now,
      updatedAt: now,
    });

    // Create owner membership
    await db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: actor.userId,
      role: "owner",
      allBoardsRead: true,
      allBoardsWrite: true,
      createdAt: now,
      updatedAt: now,
    });

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return Response.json(org[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
