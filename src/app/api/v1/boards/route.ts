export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { boards } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/v1/boards
 * List boards visible to the current organization member.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, 'No active organization');
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const gatewayId = url.searchParams.get('gateway_id');
    const boardGroupId = url.searchParams.get('board_group_id');

    const query = db
      .select()
      .from(boards)
      .where(eq(boards.organizationId, actor.orgId))
      .orderBy(sql`lower(${boards.name}) asc`)
      .limit(limit)
      .offset(offset);

    const result = await query;

    // Filter in-memory for optional params (D1 doesn't support dynamic WHERE well)
    const filtered = result.filter((b) => {
      if (gatewayId && b.gatewayId !== gatewayId) return false;
      if (boardGroupId && b.boardGroupId !== boardGroupId) return false;
      return true;
    });

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boards)
      .where(eq(boards.organizationId, actor.orgId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(filtered, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards
 * Create a board in the active organization.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== 'user' || !actor.orgId) {
      throw new ApiError(403, 'No active organization');
    }

    const body = await request.json() as Record<string, unknown>;
    const name = ((body.name as string) || '').trim();
    if (!name) {
      throw new ApiError(422, 'Board name is required');
    }

    const slug = ((body.slug as string) || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const now = new Date().toISOString();
    const boardId = crypto.randomUUID();

    await db.insert(boards).values({
      id: boardId,
      organizationId: actor.orgId,
      name,
      slug,
      description: (body.description as string) || '',
      gatewayId: (body.gateway_id as string) || null,
      boardGroupId: (body.board_group_id as string) || null,
      boardType: (body.board_type as string) || 'goal',
      objective: (body.objective as string) || null,
      successMetrics: body.success_metrics ? body.success_metrics as Record<string, unknown> : null,
      targetDate: (body.target_date as string) || null,
      goalConfirmed: (body.goal_confirmed as boolean) ?? false,
      goalSource: (body.goal_source as string) || null,
      requireApprovalForDone: (body.require_approval_for_done as boolean) ?? true,
      requireReviewBeforeDone: (body.require_review_before_done as boolean) ?? false,
      blockStatusChangesWithPendingApproval: (body.block_status_changes_with_pending_approval as boolean) ?? false,
      onlyLeadCanChangeStatus: (body.only_lead_can_change_status as boolean) ?? false,
      maxAgents: (body.max_agents as number) ?? 1,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
