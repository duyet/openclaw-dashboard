/**
 * Shared helper for auto-creating a Clerk user's DB record on first access.
 *
 * Edge-runtime compatible — no Node.js built-ins.
 * Used by both the bootstrap endpoint and /users/me to handle the case where
 * a valid Clerk JWT arrives but no DB user row exists yet.
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import type { ActorContext } from "./index";

export type BootstrappedUser = typeof users.$inferSelect;

/**
 * Ensure a DB user record exists for the given Clerk identity.
 *
 * Algorithm:
 * 1. If `actor.userId` is already set, fetch and return the existing record.
 * 2. If `actor.clerkId` is present but `actor.userId` is not, perform a race-
 *    safe upsert: check by clerkId first, create if absent.
 * 3. Throws if neither identifier is available.
 *
 * The caller is responsible for verifying `actor.type === "user"` before
 * calling this function.
 */
export async function bootstrapClerkUser(
  db: Database,
  actor: ActorContext
): Promise<BootstrappedUser> {
  // Fast path: DB user already resolved during auth.
  if (actor.userId) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // userId was set but row is gone — should not happen, surface a clear error.
    throw new Error(`User record not found for userId=${actor.userId}`);
  }

  // New Clerk user — clerkId must be present to create a record.
  if (!actor.clerkId) {
    throw new Error("Cannot bootstrap user: no userId or clerkId on actor");
  }

  // Race-condition guard: another concurrent request may have already created
  // the user between the auth resolution step and this point.
  const raceCheck = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, actor.clerkId))
    .limit(1);

  if (raceCheck.length > 0) {
    return raceCheck[0];
  }

  // Create user + personal organization + owner membership in sequence.
  // D1 does not support multi-statement transactions via Drizzle on edge, so
  // we insert in dependency order (org → user → membership).
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();

  const displayName =
    actor.clerkName ||
    (actor.clerkEmail ? actor.clerkEmail.split("@")[0] : "User");
  const orgName = `${displayName}'s Organization`;

  // 1. Personal organization
  await db.insert(organizations).values({
    id: orgId,
    name: orgName,
    createdAt: now,
    updatedAt: now,
  });

  // 2. User record
  await db.insert(users).values({
    id: userId,
    clerkUserId: actor.clerkId,
    email: actor.clerkEmail ?? null,
    name: displayName,
    activeOrganizationId: orgId,
  });

  // 3. Owner membership
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

  return created[0];
}
