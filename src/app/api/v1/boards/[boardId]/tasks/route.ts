export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { tasks, boards, activityEvents } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { eq, and, inArray, sql } from 'drizzle-orm';

const ALLOWED_STATUSES = ['inbox', 'in_progress', 'review', 'done'];

/**
 * GET /api/v1/boards/[boardId]/tasks
 * List board tasks with optional status and assignment filters.
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

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const statusFilter = url.searchParams.get('status');
    const assignedAgentId = url.searchParams.get('assigned_agent_id');
    const unassigned = url.searchParams.get('unassigned');

    // Parse status filter values
    const statusValues: string[] = [];
    if (statusFilter) {
      const values = statusFilter.split(',').map((s) => s.trim());
      for (const v of values) {
        if (!ALLOWED_STATUSES.includes(v)) {
          throw new ApiError(422, 'Unsupported task status filter.');
        }
        statusValues.push(v);
      }
    }

    // Build base query
    let result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, boardId))
      .orderBy(sql`${tasks.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    // Apply filters in-memory for D1 compatibility
    if (statusValues.length > 0) {
      result = result.filter((t) => statusValues.includes(t.status));
    }
    if (assignedAgentId) {
      result = result.filter((t) => t.assignedAgentId === assignedAgentId);
    }
    if (unassigned === 'true') {
      result = result.filter((t) => !t.assignedAgentId);
    }

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(eq(tasks.boardId, boardId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/tasks
 * Create a task on the board.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId } = await params;

    // Verify the board exists
    const boardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!boardResult.length) {
      throw new ApiError(404, 'Board not found');
    }

    const body = await request.json() as Record<string, unknown>;
    const title = ((body.title as string) || '').trim();
    if (!title) {
      throw new ApiError(422, 'Task title is required');
    }

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();

    await db.insert(tasks).values({
      id: taskId,
      boardId,
      title,
      description: (body.description as string) || null,
      status: ((body.status as string) || 'inbox') as 'inbox' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled',
      priority: ((body.priority as string) || 'medium') as 'low' | 'medium' | 'high' | 'critical',
      dueAt: (body.due_at as string) || null,
      createdByUserId: actor.type === 'user' ? actor.userId || null : null,
      assignedAgentId: (body.assigned_agent_id as string) || null,
      autoCreated: (body.auto_created as boolean) ?? false,
      autoReason: (body.auto_reason as string) || null,
      createdAt: now,
      updatedAt: now,
    });

    // Record activity event
    await db.insert(activityEvents).values({
      id: crypto.randomUUID(),
      eventType: 'task.created',
      message: `Task created: ${title}.`,
      taskId,
      agentId: actor.type === 'agent' ? actor.agentId || null : null,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
