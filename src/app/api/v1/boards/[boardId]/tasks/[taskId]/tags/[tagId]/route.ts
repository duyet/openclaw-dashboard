export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tagAssignments, tasks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * DELETE /api/v1/boards/:boardId/tasks/:taskId/tags/:tagId
 * Remove a specific tag from a task.
 */
export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ boardId: string; taskId: string; tagId: string }> }
) {
  try {
    const { boardId, taskId, tagId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    // Verify task exists on this board
    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (task.length === 0) {
      throw new ApiError(404, "Task not found");
    }

    // Find the tag assignment
    const existing = await db
      .select({ id: tagAssignments.id })
      .from(tagAssignments)
      .where(
        and(eq(tagAssignments.taskId, taskId), eq(tagAssignments.tagId, tagId))
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Tag assignment not found");
    }

    await db
      .delete(tagAssignments)
      .where(eq(tagAssignments.id, existing[0].id));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
