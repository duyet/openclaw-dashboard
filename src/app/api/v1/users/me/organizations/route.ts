export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/users/me/organizations
 * List organizations the current user is a member of.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select({
        membershipId: organizationMembers.id,
        role: organizationMembers.role,
        allBoardsRead: organizationMembers.allBoardsRead,
        allBoardsWrite: organizationMembers.allBoardsWrite,
        memberSince: organizationMembers.createdAt,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationCreatedAt: organizations.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId)
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
