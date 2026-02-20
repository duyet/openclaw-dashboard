export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { approvals } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/approvals/[approvalId]
 * Get a single approval by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { approvalId } = await params;

    const result = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, 'Approval not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/approvals/[approvalId]
 * Approve or reject an approval.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { approvalId } = await params;

    if (actor.type !== 'user') {
      throw new ApiError(403, 'Only users can resolve approvals');
    }

    const existing = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Approval not found');
    }

    if (existing[0].status !== 'pending') {
      throw new ApiError(409, 'Approval has already been resolved');
    }

    const body = await request.json() as Record<string, unknown>;
    const status = body.status;

    if (status !== 'approved' && status !== 'rejected') {
      throw new ApiError(422, 'Status must be "approved" or "rejected"');
    }

    const now = new Date().toISOString();

    await db
      .update(approvals)
      .set({
        status,
        resolvedAt: now,
      })
      .where(eq(approvals.id, approvalId));

    const result = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
