export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { skillPacks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/skills/packs/:packId
 * Get a single skill pack.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const result = await db
      .select()
      .from(skillPacks)
      .where(
        and(
          eq(skillPacks.id, packId),
          eq(skillPacks.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Skill pack not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/skills/packs/:packId
 * Update a skill pack.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select()
      .from(skillPacks)
      .where(
        and(
          eq(skillPacks.id, packId),
          eq(skillPacks.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Skill pack not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") updates.name = body.name;
    if (body.description !== undefined)
      updates.description = body.description || null;
    if (typeof body.source_url === "string")
      updates.sourceUrl = body.source_url;
    if (typeof body.branch === "string") updates.branch = body.branch;
    if (body.metadata !== undefined)
      updates.metadata = JSON.stringify(body.metadata || {});

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, "No valid fields to update");
    }

    updates.updatedAt = new Date().toISOString();

    await db.update(skillPacks).set(updates).where(eq(skillPacks.id, packId));

    const result = await db
      .select()
      .from(skillPacks)
      .where(eq(skillPacks.id, packId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/skills/packs/:packId
 * Delete a skill pack.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select({ id: skillPacks.id })
      .from(skillPacks)
      .where(
        and(
          eq(skillPacks.id, packId),
          eq(skillPacks.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Skill pack not found");
    }

    await db.delete(skillPacks).where(eq(skillPacks.id, packId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
