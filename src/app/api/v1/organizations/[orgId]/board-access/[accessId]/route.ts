export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationBoardAccess, organizationMembers } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Helper: verify the access record belongs to a member of this org
// ---------------------------------------------------------------------------
async function getVerifiedAccess(
  db: ReturnType<typeof getDb>,
  orgId: string,
  accessId: string
) {
  const access = await db
    .select()
    .from(organizationBoardAccess)
    .where(eq(organizationBoardAccess.id, accessId))
    .limit(1);

  if (access.length === 0) {
    throw new ApiError(404, "Board access record not found");
  }

  // Verify the access record's member belongs to this org
  const member = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, access[0].organizationMemberId),
        eq(organizationMembers.organizationId, orgId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    throw new ApiError(
      404,
      "Board access record not found in this organization"
    );
  }

  return access[0];
}

/**
 * GET /api/v1/organizations/:orgId/board-access/:accessId
 * Get a specific board access record.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; accessId: string }> }
) {
  try {
    const { orgId, accessId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const access = await getVerifiedAccess(db, orgId, accessId);

    return Response.json(access);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/organizations/:orgId/board-access/:accessId
 * Update can_read / can_write on a board access record.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; accessId: string }> }
) {
  try {
    const { orgId, accessId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can update board access");
    }

    await getVerifiedAccess(db, orgId, accessId);

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.can_read === "boolean") {
      updates.canRead = body.can_read;
    }
    if (typeof body.can_write === "boolean") {
      updates.canWrite = body.can_write;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(
        422,
        "At least one of can_read or can_write must be provided"
      );
    }

    updates.updatedAt = new Date().toISOString();

    await db
      .update(organizationBoardAccess)
      .set(updates)
      .where(eq(organizationBoardAccess.id, accessId));

    const result = await db
      .select()
      .from(organizationBoardAccess)
      .where(eq(organizationBoardAccess.id, accessId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/organizations/:orgId/board-access/:accessId
 * Remove a board access record.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string; accessId: string }> }
) {
  try {
    const { orgId, accessId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can remove board access");
    }

    await getVerifiedAccess(db, orgId, accessId);

    await db
      .delete(organizationBoardAccess)
      .where(eq(organizationBoardAccess.id, accessId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
