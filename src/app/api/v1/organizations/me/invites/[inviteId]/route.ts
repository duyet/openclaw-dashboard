export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationInvites, organizationMembers } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Helper: verify actor has admin/owner role in the org
// ---------------------------------------------------------------------------
async function requireOrgAdmin(
  db: ReturnType<typeof getDb>,
  orgId: string,
  userId: string
) {
  const rows = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new ApiError(403, "Not a member of this organization");
  }

  if (rows[0].role !== "owner" && rows[0].role !== "admin") {
    throw new ApiError(403, "Admin or owner role required");
  }

  return rows[0];
}

/**
 * DELETE /api/v1/organizations/me/invites/:inviteId
 * Cancel/delete an invite in the active organization. Requires admin or owner role.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  try {
    const { inviteId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    // Require admin/owner to cancel invites
    await requireOrgAdmin(db, actor.orgId, actor.userId);

    // Verify invite exists and belongs to the active org
    const existing = await db
      .select({ id: organizationInvites.id })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.id, inviteId),
          eq(organizationInvites.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Invite not found");
    }

    await db
      .delete(organizationInvites)
      .where(eq(organizationInvites.id, inviteId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
