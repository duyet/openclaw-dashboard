export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Helper: verify the actor is a member of the org (returns membership row)
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
// Helper: verify the actor has admin or owner role in the org
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
// GET /api/v1/organizations/:orgId
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Verify membership (any role)
    await requireOrgMembership(db, orgId, actor.userId);

    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/organizations/:orgId
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Require admin/owner
    await requireOrgAdmin(db, orgId, actor.userId);

    const body = (await request.json()) as Record<string, unknown> as Record<
      string,
      unknown
    >;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        throw new ApiError(422, "Organization name cannot be empty");
      }
      updates.name = name;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, "No valid fields to update");
    }

    updates.updatedAt = new Date().toISOString();

    await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId));

    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/organizations/:orgId
// ---------------------------------------------------------------------------
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Only owners can delete an organization
    const membership = await requireOrgAdmin(db, orgId, actor.userId);
    if (membership.role !== "owner") {
      throw new ApiError(
        403,
        "Only the organization owner can delete an organization"
      );
    }

    // Verify the org exists before deleting
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    await db.delete(organizations).where(eq(organizations.id, orgId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
