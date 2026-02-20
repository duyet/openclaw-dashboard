export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import {
  tasks,
  activityEvents,
  taskDependencies,
  taskFingerprints,
  tagAssignments,
  taskCustomFieldValues,
  approvalTaskLinks,
  approvals,
} from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and, or, sql } from 'drizzle-orm';

/**
 * GET /api/v1/boards/[boardId]/tasks/[taskId]
 * Get a single task by ID.
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

    const result = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, 'Task not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/boards/[boardId]/tasks/[taskId]
 * Update task status, assignment, and other fields.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId, taskId } = await params;

    const existing = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Task not found');
    }

    const task = existing[0];
    const body = await request.json() as Record<string, unknown>;
    const now = new Date().toISOString();
    const previousStatus = task.status;

    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_at !== undefined) updates.dueAt = body.due_at;
    if (body.assigned_agent_id !== undefined) updates.assignedAgentId = body.assigned_agent_id;

    if (body.status !== undefined) {
      const targetStatus = body.status;
      updates.status = targetStatus;

      // Handle status transition side-effects
      if (targetStatus === 'inbox') {
        updates.assignedAgentId = null;
        updates.previousInProgressAt = task.inProgressAt;
        updates.inProgressAt = null;
      } else if (targetStatus === 'review') {
        updates.previousInProgressAt = task.inProgressAt;
        updates.assignedAgentId = null;
        updates.inProgressAt = null;
      } else if (targetStatus === 'in_progress') {
        updates.inProgressAt = now;
        if (actor.type === 'agent' && actor.agentId) {
          updates.assignedAgentId = actor.agentId;
        }
      }
    }

    await db.update(tasks).set(updates).where(eq(tasks.id, taskId));

    // Record activity event
    const updatedStatus = (updates.status as string) || task.status;
    const eventType = updatedStatus !== previousStatus ? 'task.status_changed' : 'task.updated';
    const message =
      updatedStatus !== previousStatus
        ? `Task moved to ${updatedStatus}: ${task.title}.`
        : `Task updated: ${task.title}.`;

    await db.insert(activityEvents).values({
      id: crypto.randomUUID(),
      eventType,
      message,
      taskId,
      agentId: actor.type === 'agent' ? actor.agentId || null : null,
      createdAt: now,
    });

    // Handle inline comment
    if (body.comment && (body.comment as string).trim()) {
      await db.insert(activityEvents).values({
        id: crypto.randomUUID(),
        eventType: 'task.comment',
        message: body.comment as string,
        taskId,
        agentId: actor.type === 'agent' ? actor.agentId || null : null,
        createdAt: now,
      });
    }

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/boards/[boardId]/tasks/[taskId]
 * Delete a task and related records.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { boardId, taskId } = await params;

    if (actor.type !== 'user') {
      throw new ApiError(403, 'Only users can delete tasks');
    }

    const existing = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Task not found');
    }

    // Delete related records first
    await db.delete(activityEvents).where(eq(activityEvents.taskId, taskId));
    await db.delete(taskFingerprints).where(eq(taskFingerprints.taskId, taskId));
    await db.delete(approvalTaskLinks).where(eq(approvalTaskLinks.taskId, taskId));
    await db
      .delete(taskDependencies)
      .where(
        or(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnTaskId, taskId),
        ),
      );
    await db.delete(tagAssignments).where(eq(tagAssignments.taskId, taskId));
    await db.delete(taskCustomFieldValues).where(eq(taskCustomFieldValues.taskId, taskId));

    // Delete the task
    await db.delete(tasks).where(eq(tasks.id, taskId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
