export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { activityEvents, tasks } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/v1/boards/[boardId]/tasks/[taskId]/comments
 * List comments for a task in chronological order.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { boardId, taskId } = await params;

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.taskId, taskId),
          eq(activityEvents.eventType, 'task.comment'),
        ),
      )
      .orderBy(sql`${activityEvents.createdAt} asc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.taskId, taskId),
          eq(activityEvents.eventType, 'task.comment'),
        ),
      );

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/tasks/[taskId]/comments
 * Create a task comment.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId, taskId } = await params;

    // Verify task exists
    const taskResult = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (!taskResult.length) {
      throw new ApiError(404, 'Task not found');
    }

    const body = await request.json() as Record<string, unknown>;
    const message = ((body.message as string) || '').trim();
    if (!message) {
      throw new ApiError(422, 'Comment is required.');
    }

    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();

    await db.insert(activityEvents).values({
      id: eventId,
      eventType: 'task.comment',
      message,
      taskId,
      agentId: actor.type === 'agent' ? actor.agentId || null : null,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.id, eventId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
