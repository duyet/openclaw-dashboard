export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/organizations/me/member
 * Return the caller's membership record in their active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(404, "No active organization");
    }

    const rows = await db
      .select({
        id: organizationMembers.id,
        organization_id: organizationMembers.organizationId,
        user_id: organizationMembers.userId,
        role: organizationMembers.role,
        all_boards_read: organizationMembers.allBoardsRead,
        all_boards_write: organizationMembers.allBoardsWrite,
        created_at: organizationMembers.createdAt,
        updated_at: organizationMembers.updatedAt,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, actor.userId),
          eq(organizationMembers.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ApiError(404, "Not a member of the active organization");
    }

    return Response.json(rows[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
