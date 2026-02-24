export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/auth/bootstrap
 *
 * Resolve caller identity from auth headers and return the canonical user profile.
 * Creates the user record if it does not yet exist (Clerk flow).
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user") {
      throw new ApiError(401, "Unauthorized");
    }

    // Existing user — return their profile.
    if (actor.userId) {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);

      if (existing.length === 0) {
        throw new ApiError(404, "User not found");
      }

      return Response.json(existing[0]);
    }

    // New Clerk user — auto-create user + personal organization.
    if (!actor.clerkId) {
      throw new ApiError(401, "User not found. Please sign up first.");
    }

    // Double-check: race condition guard — another request may have created
    // the user between the auth resolve and now.
    const raceCheck = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, actor.clerkId))
      .limit(1);

    if (raceCheck.length > 0) {
      return Response.json(raceCheck[0]);
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();

    const displayName =
      actor.clerkName ||
      (actor.clerkEmail ? actor.clerkEmail.split("@")[0] : "User");
    const orgName = `${displayName}'s Organization`;

    // 1. Create personal organization
    await db.insert(organizations).values({
      id: orgId,
      name: orgName,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create user record
    await db.insert(users).values({
      id: userId,
      clerkUserId: actor.clerkId,
      email: actor.clerkEmail ?? null,
      name: displayName,
      activeOrganizationId: orgId,
    });

    // 3. Create owner membership
    await db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      role: "owner",
      allBoardsRead: true,
      allBoardsWrite: true,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return Response.json(created[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
