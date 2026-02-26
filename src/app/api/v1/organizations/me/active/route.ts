export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, users } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// PATCH /api/v1/organizations/me/active
// Switch the authenticated user's active organization.
// Body: { org_id: string }
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const orgId = typeof body.org_id === "string" ? body.org_id.trim() : "";

    if (!orgId) {
      throw new ApiError(422, "org_id is required");
    }

    // Verify the user is a member of the target organization
    const membership = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, actor.userId)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      throw new ApiError(403, "Not a member of the target organization");
    }

    // Update the user's active organization
    await db
      .update(users)
      .set({ activeOrganizationId: orgId })
      .where(eq(users.id, actor.userId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
