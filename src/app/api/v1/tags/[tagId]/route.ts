export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/v1/tags/:tagId
 * Get a single tag by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const { tagId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, 'No active organization');
    }

    const result = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.organizationId, actor.orgId)))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, 'Tag not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/tags/:tagId
 * Update a tag.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const { tagId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.orgId) {
      throw new ApiError(403, 'No active organization');
    }

    const existing = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.organizationId, actor.orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, 'Tag not found');
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) throw new ApiError(422, 'Tag name cannot be empty');
      updates.name = name;
    }
    if (typeof body.slug === 'string') {
      updates.slug = body.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (typeof body.color === 'string') {
      updates.color = body.color;
    }
    if (body.description !== undefined) {
      updates.description = body.description || null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, 'No valid fields to update');
    }

    updates.updatedAt = new Date().toISOString();

    await db.update(tags).set(updates).where(eq(tags.id, tagId));

    const result = await db
      .select()
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/tags/:tagId
 * Delete a tag.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const { tagId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.orgId) {
      throw new ApiError(403, 'No active organization');
    }

    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.organizationId, actor.orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, 'Tag not found');
    }

    await db.delete(tags).where(eq(tags.id, tagId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
