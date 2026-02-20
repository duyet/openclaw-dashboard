export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { taskDependencies, tasks } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/v1/boards/[boardId]/tasks/[taskId]/dependencies
 * List dependency IDs for a task.
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

    const deps = await db
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.boardId, boardId),
        ),
      );

    return Response.json({
      task_id: taskId,
      depends_on_task_ids: deps.map((d) => d.dependsOnTaskId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/tasks/[taskId]/dependencies
 * Add a single dependency to a task.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
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

    if (taskResult[0].status === 'done') {
      throw new ApiError(409, 'Cannot change task dependencies after a task is done.');
    }

    const body = await request.json() as Record<string, unknown>;
    const dependsOnTaskId = body.depends_on_task_id as string;
    if (!dependsOnTaskId) {
      throw new ApiError(422, 'depends_on_task_id is required');
    }

    if (dependsOnTaskId === taskId) {
      throw new ApiError(422, 'A task cannot depend on itself.');
    }

    // Validate the dependency target exists on this board
    const depTarget = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, dependsOnTaskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (!depTarget.length) {
      throw new ApiError(422, `Dependency task ${dependsOnTaskId} not found on this board.`);
    }

    // Check for duplicate
    const existing = await db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
          eq(taskDependencies.boardId, boardId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, 'Dependency already exists');
    }

    const now = new Date().toISOString();
    const depId = crypto.randomUUID();

    await db.insert(taskDependencies).values({
      id: depId,
      boardId,
      taskId,
      dependsOnTaskId,
      createdAt: now,
    });

    return Response.json(
      { id: depId, task_id: taskId, depends_on_task_id: dependsOnTaskId },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/v1/boards/[boardId]/tasks/[taskId]/dependencies
 * Replace the dependency set for a task.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
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

    if (taskResult[0].status === 'done') {
      throw new ApiError(409, 'Cannot change task dependencies after a task is done.');
    }

    const body = await request.json() as Record<string, unknown>;
    const dependsOnTaskIds: string[] = (body.depends_on_task_ids as string[]) || [];

    // Validate no self-reference
    if (dependsOnTaskIds.includes(taskId)) {
      throw new ApiError(422, 'A task cannot depend on itself.');
    }

    // Validate all referenced tasks exist in this board
    for (const depId of dependsOnTaskIds) {
      const depResult = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, depId), eq(tasks.boardId, boardId)))
        .limit(1);
      if (!depResult.length) {
        throw new ApiError(422, `Dependency task ${depId} not found on this board.`);
      }
    }

    // Delete existing dependencies
    await db
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.boardId, boardId),
        ),
      );

    // Insert new dependencies
    const now = new Date().toISOString();
    for (const depId of dependsOnTaskIds) {
      await db.insert(taskDependencies).values({
        id: crypto.randomUUID(),
        boardId,
        taskId,
        dependsOnTaskId: depId,
        createdAt: now,
      });
    }

    return Response.json({
      task_id: taskId,
      depends_on_task_ids: dependsOnTaskIds,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
