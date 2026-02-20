export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/users/me
 * Return the authenticated user's current profile.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, 'User not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/users/me
 * Update the authenticated user's profile.
 */
export async function PATCH(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const body = await request.json() as Record<string, unknown>;
    const allowedFields = [
      'name', 'preferred_name', 'pronouns', 'timezone',
      'notes', 'context', 'active_organization_id',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        // Map snake_case to camelCase for Drizzle
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        updates[camelField] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(422, 'No valid fields to update');
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, actor.userId));

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/users/me
 * Delete the authenticated user account.
 */
export async function DELETE(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    await db.delete(users).where(eq(users.id, actor.userId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
