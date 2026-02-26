export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gatewayInstalledSkills, marketplaceSkills } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/skills/:skillId
 * Get a single marketplace skill.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const result = await db
      .select()
      .from(marketplaceSkills)
      .where(
        and(
          eq(marketplaceSkills.id, skillId),
          eq(marketplaceSkills.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Skill not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/skills/:skillId
 * Update a marketplace skill.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select()
      .from(marketplaceSkills)
      .where(
        and(
          eq(marketplaceSkills.id, skillId),
          eq(marketplaceSkills.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Skill not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") updates.name = body.name;
    if (body.description !== undefined)
      updates.description = body.description || null;
    if (body.category !== undefined) updates.category = body.category || null;
    if (body.risk !== undefined) updates.risk = body.risk || null;
    if (body.source !== undefined) updates.source = body.source || null;
    if (typeof body.source_url === "string")
      updates.sourceUrl = body.source_url;
    if (body.metadata !== undefined)
      updates.metadata = JSON.stringify(body.metadata || {});

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, "No valid fields to update");
    }

    updates.updatedAt = new Date().toISOString();

    await db
      .update(marketplaceSkills)
      .set(updates)
      .where(eq(marketplaceSkills.id, skillId));

    const result = await db
      .select()
      .from(marketplaceSkills)
      .where(eq(marketplaceSkills.id, skillId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/skills/:skillId
 * Delete a marketplace skill and its gateway installations.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select({ id: marketplaceSkills.id })
      .from(marketplaceSkills)
      .where(
        and(
          eq(marketplaceSkills.id, skillId),
          eq(marketplaceSkills.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Skill not found");
    }

    // Delete gateway installations first
    await db
      .delete(gatewayInstalledSkills)
      .where(eq(gatewayInstalledSkills.skillId, skillId));

    await db.delete(marketplaceSkills).where(eq(marketplaceSkills.id, skillId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
