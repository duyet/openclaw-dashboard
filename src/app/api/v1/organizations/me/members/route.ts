export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

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

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/me/members
// List members of the active organization with user profiles.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    // Require membership to view members
    await requireOrgMembership(db, actor.orgId, actor.userId);

    // Verify org exists
    const orgExists = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.orgId))
      .limit(1);

    if (orgExists.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

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
        // User fields
        userEmail: users.email,
        userName: users.name,
        userPreferredName: users.preferredName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, actor.orgId))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/me/members
// Add an existing user as a member of the active organization.
// Body: { user_id: string, role?: string }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    // Require admin/owner to add members
    await requireOrgAdmin(db, actor.orgId, actor.userId);

    // Verify org exists
    const orgExists = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.orgId))
      .limit(1);

    if (orgExists.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";

    if (!targetUserId) {
      throw new ApiError(422, "user_id is required");
    }

    const role = typeof body.role === "string" ? body.role.trim() : "member";
    const validRoles = ["owner", "admin", "member"];
    if (!validRoles.includes(role)) {
      throw new ApiError(422, `role must be one of: ${validRoles.join(", ")}`);
    }

    // Verify the target user exists
    const targetUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (targetUser.length === 0) {
      throw new ApiError(404, "User not found");
    }

    // Check if already a member
    const existing = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, actor.orgId),
          eq(organizationMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, "User is already a member of this organization");
    }

    const now = new Date().toISOString();
    const memberId = crypto.randomUUID();

    await db.insert(organizationMembers).values({
      id: memberId,
      organizationId: actor.orgId,
      userId: targetUserId,
      role,
      allBoardsRead: false,
      allBoardsWrite: false,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.id, memberId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
