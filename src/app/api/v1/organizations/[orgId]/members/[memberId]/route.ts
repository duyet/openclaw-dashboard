export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Helper: verify actor is a member of the org
// ---------------------------------------------------------------------------
async function requireOrgMembership(
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

  return rows[0];
}

// ---------------------------------------------------------------------------
// Helper: verify actor has admin/owner role in the org
// ---------------------------------------------------------------------------
async function requireOrgAdmin(
  db: ReturnType<typeof getDb>,
  orgId: string,
  userId: string
) {
  const membership = await requireOrgMembership(db, orgId, userId);

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ApiError(403, "Admin or owner role required");
  }

  return membership;
}

/**
 * GET /api/v1/organizations/:orgId/members/:memberId
 * Get details for a specific organization member.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Require membership to view member details
    await requireOrgMembership(db, orgId, actor.userId);

    const result = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        allBoardsRead: organizationMembers.allBoardsRead,
        allBoardsWrite: organizationMembers.allBoardsWrite,
        createdAt: organizationMembers.createdAt,
        updatedAt: organizationMembers.updatedAt,
        userEmail: users.email,
        userName: users.name,
        userPreferredName: users.preferredName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Member not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/organizations/:orgId/members/:memberId
 * Update role and permissions for a member.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Require admin/owner to update members
    await requireOrgAdmin(db, orgId, actor.userId);

    // Verify member exists in this org
    const existing = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Member not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.role === "string") {
      const validRoles = ["owner", "admin", "member"];
      if (!validRoles.includes(body.role)) {
        throw new ApiError(
          422,
          `role must be one of: ${validRoles.join(", ")}`
        );
      }
      updates.role = body.role;
    }

    if (typeof body.all_boards_read === "boolean") {
      updates.allBoardsRead = body.all_boards_read;
    }
    if (typeof body.all_boards_write === "boolean") {
      updates.allBoardsWrite = body.all_boards_write;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, "At least one field must be provided for update");
    }

    updates.updatedAt = new Date().toISOString();

    await db
      .update(organizationMembers)
      .set(updates)
      .where(eq(organizationMembers.id, memberId));

    // Return updated record with user details
    const result = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        allBoardsRead: organizationMembers.allBoardsRead,
        allBoardsWrite: organizationMembers.allBoardsWrite,
        createdAt: organizationMembers.createdAt,
        updatedAt: organizationMembers.updatedAt,
        userEmail: users.email,
        userName: users.name,
        userPreferredName: users.preferredName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.id, memberId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/organizations/:orgId/members/:memberId
 * Remove a member from the organization. Requires admin/owner role.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Require admin/owner to remove members
    await requireOrgAdmin(db, orgId, actor.userId);

    // Verify member exists in this org
    const existing = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Member not found");
    }

    // Prevent removing the last owner
    if (existing[0].role === "owner") {
      const ownerCount = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.role, "owner")
          )
        );

      if (ownerCount.length <= 1) {
        throw new ApiError(
          422,
          "Cannot remove the last owner of the organization"
        );
      }
    }

    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, memberId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
