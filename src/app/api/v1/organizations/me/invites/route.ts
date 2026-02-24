export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  organizationInvites,
  organizationMembers,
  organizations,
} from "@/lib/db/schema";
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
// GET /api/v1/organizations/me/invites
// List all invites for the active organization (token excluded).
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

    // Require membership to view invites
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

    // Return invites without the token field for security
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
      .where(eq(organizationInvites.organizationId, actor.orgId))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationInvites)
      .where(eq(organizationInvites.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/me/invites
// Create an invite for an email address in the active organization.
// Body: { email: string, role?: string }
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

    // Require admin/owner to create invites
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
    const invitedEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!invitedEmail) {
      throw new ApiError(422, "email is required");
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      throw new ApiError(422, "email must be a valid email address");
    }

    const role = typeof body.role === "string" ? body.role.trim() : "member";
    const validRoles = ["owner", "admin", "member"];
    if (!validRoles.includes(role)) {
      throw new ApiError(422, `role must be one of: ${validRoles.join(", ")}`);
    }

    // Check for a pending (not yet accepted) invite for the same email
    const existingPending = await db
      .select({ id: organizationInvites.id })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.organizationId, actor.orgId),
          eq(organizationInvites.invitedEmail, invitedEmail),
          sql`${organizationInvites.acceptedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingPending.length > 0) {
      throw new ApiError(
        409,
        "A pending invite already exists for this email address"
      );
    }

    // Generate a cryptographically random invite token (edge-safe, no Buffer)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const now = new Date().toISOString();
    const inviteId = crypto.randomUUID();

    await db.insert(organizationInvites).values({
      id: inviteId,
      organizationId: actor.orgId,
      invitedEmail,
      token,
      role,
      allBoardsRead: false,
      allBoardsWrite: false,
      createdByUserId: actor.userId,
      acceptedByUserId: null,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Return the invite including the token so the caller can send the invite link
    const result = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.id, inviteId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
