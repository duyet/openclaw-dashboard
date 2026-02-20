export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { taskDependencies } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and } from 'drizzle-orm';

/**
 * DELETE /api/v1/boards/:boardId/tasks/:taskId/dependencies/:depId
 * Remove a single task dependency.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string; depId: string }> },
) {
  try {
    const { boardId, taskId, depId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const existing = await db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.id, depId),
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.boardId, boardId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, 'Dependency not found');
    }

    await db.delete(taskDependencies).where(eq(taskDependencies.id, depId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
