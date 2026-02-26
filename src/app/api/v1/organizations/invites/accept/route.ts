export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  organizationInvites,
  organizationMembers,
  users,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/invites/accept
// Accept an organization invite using a token.
// Body: { token: string }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      throw new ApiError(422, "token is required");
    }

    // Find the invite by token
    const invite = await db
      .select()
      .from(organizationInvites)
      .where(eq(organizationInvites.token, token))
      .limit(1);

    if (invite.length === 0) {
      throw new ApiError(404, "Invite not found");
    }

    const inviteRecord = invite[0];

    // Check if the invite has already been accepted
    if (inviteRecord.acceptedAt !== null) {
      throw new ApiError(409, "This invite has already been accepted");
    }

    const orgId = inviteRecord.organizationId;

    // Check if the user is already a member of the org
    const existingMembership = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, actor.userId)
        )
      )
      .limit(1);

    if (existingMembership.length === 0) {
      // Add user as a member of the organization
      const now = new Date().toISOString();
      const memberId = crypto.randomUUID();

      await db.insert(organizationMembers).values({
        id: memberId,
        organizationId: orgId,
        userId: actor.userId,
        role: inviteRecord.role,
        allBoardsRead: inviteRecord.allBoardsRead,
        allBoardsWrite: inviteRecord.allBoardsWrite,
        createdAt: now,
        updatedAt: now,
      });
    }

    const now = new Date().toISOString();

    // Mark the invite as accepted
    await db
      .update(organizationInvites)
      .set({
        acceptedByUserId: actor.userId,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(eq(organizationInvites.id, inviteRecord.id));

    // Set the accepted org as the user's active organization
    await db
      .update(users)
      .set({ activeOrganizationId: orgId })
      .where(eq(users.id, actor.userId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
