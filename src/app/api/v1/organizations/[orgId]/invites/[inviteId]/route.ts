export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { organizations, organizationMembers, organizationInvites } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helper: verify actor is a member of the org
// ---------------------------------------------------------------------------
async function requireOrgMembership(
  db: ReturnType<typeof getDb>,
  orgId: string,
  userId: string,
) {
  const rows = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new ApiError(403, 'Not a member of this organization');
  }

  return rows[0];
}

// ---------------------------------------------------------------------------
// Helper: verify actor has admin/owner role in the org
// ---------------------------------------------------------------------------
async function requireOrgAdmin(
  db: ReturnType<typeof getDb>,
  orgId: string,
  userId: string,
) {
  const membership = await requireOrgMembership(db, orgId, userId);

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new ApiError(403, 'Admin or owner role required');
  }

  return membership;
}

/**
 * GET /api/v1/organizations/:orgId/invites/:inviteId
 * Get details for a specific invite (token is excluded for security).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; inviteId: string }> },
) {
  try {
    const { orgId, inviteId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    // Require membership to view invite details
    await requireOrgMembership(db, orgId, actor.userId);

    const result = await db
      .select({
        id: organizationInvites.id,
        organizationId: organizationInvites.organizationId,
        invitedEmail: organizationInvites.invitedEmail,
        role: organizationInvites.role,
        allBoardsRead: organizationInvites.allBoardsRead,
        allBoardsWrite: organizationInvites.allBoardsWrite,
        createdByUserId: organizationInvites.createdByUserId,
        acceptedByUserId: organizationInvites.acceptedByUserId,
        acceptedAt: organizationInvites.acceptedAt,
        createdAt: organizationInvites.createdAt,
        updatedAt: organizationInvites.updatedAt,
      })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.id, inviteId),
          eq(organizationInvites.organizationId, orgId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, 'Invite not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/organizations/:orgId/invites/:inviteId
 * Cancel/delete an invite. Requires admin or owner role.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string; inviteId: string }> },
) {
  try {
    const { orgId, inviteId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    // Require admin/owner to cancel invites
    await requireOrgAdmin(db, orgId, actor.userId);

    // Verify invite exists and belongs to this org
    const existing = await db
      .select({ id: organizationInvites.id })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.id, inviteId),
          eq(organizationInvites.organizationId, orgId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, 'Invite not found');
    }

    await db
      .delete(organizationInvites)
      .where(eq(organizationInvites.id, inviteId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
