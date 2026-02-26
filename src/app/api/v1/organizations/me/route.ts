export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/me
// Return the active organization for the authenticated user.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, actor.orgId))
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
// DELETE /api/v1/organizations/me
// Delete the active organization. Only the owner may do this.
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    // Only owners can delete an organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, actor.orgId),
          eq(organizationMembers.userId, actor.userId)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      throw new ApiError(403, "Not a member of this organization");
    }

    if (membership[0].role !== "owner") {
      throw new ApiError(
        403,
        "Only the organization owner can delete an organization"
      );
    }

    // Verify the org exists before deleting
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.orgId))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Organization not found");
    }

    await db.delete(organizations).where(eq(organizations.id, actor.orgId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
