export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { boards, agents } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * GET /api/v1/boards/[boardId]
 * Get a single board by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { boardId } = await params;

    const result = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, 'Board not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/boards/[boardId]
 * Update mutable board properties.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId } = await params;

    if (actor.type !== 'user') {
      throw new ApiError(403, 'Only users can update boards');
    }

    const existing = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Board not found');
    }

    const body = await request.json() as Record<string, unknown>;
    const now = new Date().toISOString();

    // Validate gateway_id has a main agent if changing
    if (body.gateway_id !== undefined) {
      const gatewayId = (body.gateway_id as string) || existing[0].gatewayId;
      if (gatewayId) {
        const mainAgent = await db
          .select()
          .from(agents)
          .where(and(eq(agents.gatewayId, gatewayId), isNull(agents.boardId)))
          .limit(1);
        if (!mainAgent.length) {
          throw new ApiError(
            422,
            'gateway must have a gateway main agent before boards can be created or updated',
          );
        }
      }
    }

    // Validate goal board constraints
    if (body.board_type === 'goal') {
      const objective = body.objective ?? existing[0].objective;
      const successMetrics = body.success_metrics ?? existing[0].successMetrics;
      if (!objective || !successMetrics) {
        throw new ApiError(422, 'Goal boards require objective and success_metrics');
      }
    }

    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.description !== undefined) updates.description = body.description;
    if (body.gateway_id !== undefined) updates.gatewayId = body.gateway_id;
    if (body.board_group_id !== undefined) updates.boardGroupId = body.board_group_id;
    if (body.board_type !== undefined) updates.boardType = body.board_type;
    if (body.objective !== undefined) updates.objective = body.objective;
    if (body.success_metrics !== undefined)
      updates.successMetrics = JSON.stringify(body.success_metrics);
    if (body.target_date !== undefined) updates.targetDate = body.target_date;
    if (body.goal_confirmed !== undefined) updates.goalConfirmed = body.goal_confirmed;
    if (body.goal_source !== undefined) updates.goalSource = body.goal_source;
    if (body.require_approval_for_done !== undefined)
      updates.requireApprovalForDone = body.require_approval_for_done;
    if (body.require_review_before_done !== undefined)
      updates.requireReviewBeforeDone = body.require_review_before_done;
    if (body.block_status_changes_with_pending_approval !== undefined)
      updates.blockStatusChangesWithPendingApproval =
        body.block_status_changes_with_pending_approval;
    if (body.only_lead_can_change_status !== undefined)
      updates.onlyLeadCanChangeStatus = body.only_lead_can_change_status;
    if (body.max_agents !== undefined) updates.maxAgents = body.max_agents;

    await db.update(boards).set(updates).where(eq(boards.id, boardId));

    const updated = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    return Response.json(updated[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/boards/[boardId]
 * Delete a board and all dependent records.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId } = await params;

    if (actor.type !== 'user') {
      throw new ApiError(403, 'Only users can delete boards');
    }

    const existing = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Board not found');
    }

    // Delete the board (cascades handled by DB or explicit cleanup)
    await db.delete(boards).where(eq(boards.id, boardId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
