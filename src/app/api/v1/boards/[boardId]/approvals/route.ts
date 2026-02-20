export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { approvals, boards } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/v1/boards/:boardId/approvals
 * List approvals for a board.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const status = url.searchParams.get('status');

    let result = await db
      .select()
      .from(approvals)
      .where(eq(approvals.boardId, boardId))
      .orderBy(sql`${approvals.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    if (status) {
      result = result.filter((a) => a.status === status);
    }

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(approvals)
      .where(eq(approvals.boardId, boardId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/:boardId/approvals
 * Create an approval request for a board.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, 'Board not found');
    }

    const body = await request.json() as Record<string, unknown>;
    if (!body.action_type) throw new ApiError(422, 'action_type is required');
    if (body.confidence === undefined || body.confidence === null) {
      throw new ApiError(422, 'confidence is required');
    }

    const now = new Date().toISOString();
    const approvalId = crypto.randomUUID();

    await db.insert(approvals).values({
      id: approvalId,
      boardId,
      taskId: (body.task_id as string) || null,
      agentId: (body.agent_id as string) || null,
      actionType: body.action_type as string,
      payload: body.payload ? body.payload as Record<string, unknown> : null,
      confidence: body.confidence as number,
      rubricScores: body.rubric_scores ? body.rubric_scores as Record<string, number> : null,
      status: 'pending',
      createdAt: now,
    });

    const result = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
