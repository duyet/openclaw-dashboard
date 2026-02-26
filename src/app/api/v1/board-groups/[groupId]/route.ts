export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardGroups } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/board-groups/:groupId
 * Get a single board group.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const result = await db
      .select()
      .from(boardGroups)
      .where(
        and(
          eq(boardGroups.id, groupId),
          eq(boardGroups.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Board group not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/board-groups/:groupId
 * Update a board group.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select()
      .from(boardGroups)
      .where(
        and(
          eq(boardGroups.id, groupId),
          eq(boardGroups.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Board group not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new ApiError(422, "Board group name cannot be empty");
      updates.name = name;
    }
    if (typeof body.slug === "string") {
      updates.slug = body.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    if (body.description !== undefined) {
      updates.description = body.description || null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, "No valid fields to update");
    }

    updates.updatedAt = new Date().toISOString();

    await db
      .update(boardGroups)
      .set(updates)
      .where(eq(boardGroups.id, groupId));

    const result = await db
      .select()
      .from(boardGroups)
      .where(eq(boardGroups.id, groupId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/board-groups/:groupId
 * Delete a board group.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select({ id: boardGroups.id })
      .from(boardGroups)
      .where(
        and(
          eq(boardGroups.id, groupId),
          eq(boardGroups.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Board group not found");
    }

    await db.delete(boardGroups).where(eq(boardGroups.id, groupId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
