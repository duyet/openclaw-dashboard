export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tagAssignments, tags, tasks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/boards/:boardId/tasks/:taskId/tags
 * List tags assigned to a task.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> }
) {
  try {
    const { boardId, taskId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    // Verify task exists on this board
    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (task.length === 0) {
      throw new ApiError(404, "Task not found");
    }

    // Get tag assignments with tag details
    const assignments = await db
      .select({
        assignmentId: tagAssignments.id,
        tagId: tagAssignments.tagId,
        createdAt: tagAssignments.createdAt,
      })
      .from(tagAssignments)
      .where(eq(tagAssignments.taskId, taskId));

    // Fetch full tag details
    const tagIds = assignments.map((a) => a.tagId);
    const tagDetails: Array<{
      assignmentId: string;
      tagId: string;
      name: string;
      slug: string;
      color: string;
      createdAt: string;
    }> = [];

    for (const assignment of assignments) {
      const tagResult = await db
        .select()
        .from(tags)
        .where(eq(tags.id, assignment.tagId))
        .limit(1);

      if (tagResult.length > 0) {
        tagDetails.push({
          assignmentId: assignment.assignmentId,
          tagId: assignment.tagId,
          name: tagResult[0].name,
          slug: tagResult[0].slug,
          color: tagResult[0].color,
          createdAt: assignment.createdAt,
        });
      }
    }

    return Response.json(tagDetails);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/:boardId/tasks/:taskId/tags
 * Assign a tag to a task.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> }
) {
  try {
    const { boardId, taskId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    // Verify task exists on this board
    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
      .limit(1);

    if (task.length === 0) {
      throw new ApiError(404, "Task not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.tag_id) {
      throw new ApiError(422, "tag_id is required");
    }

    const tagId = body.tag_id as string;

    // Verify tag exists
    const tag = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);

    if (tag.length === 0) {
      throw new ApiError(404, "Tag not found");
    }

    // Check for duplicate assignment
    const existing = await db
      .select({ id: tagAssignments.id })
      .from(tagAssignments)
      .where(
        and(eq(tagAssignments.taskId, taskId), eq(tagAssignments.tagId, tagId))
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, "Tag is already assigned to this task");
    }

    const now = new Date().toISOString();
    const assignmentId = crypto.randomUUID();

    await db.insert(tagAssignments).values({
      id: assignmentId,
      taskId,
      tagId,
      createdAt: now,
    });

    return Response.json(
      {
        id: assignmentId,
        task_id: taskId,
        tag_id: body.tag_id,
        tag_name: tag[0].name,
        tag_slug: tag[0].slug,
        tag_color: tag[0].color,
        created_at: now,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/boards/:boardId/tasks/:taskId/tags
 * Remove a tag from a task. Tag ID passed as query param ?tag_id=...
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string; taskId: string }> }
) {
  try {
    const { boardId, taskId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const tagId = url.searchParams.get("tag_id");

    if (!tagId) {
      throw new ApiError(422, "tag_id query parameter is required");
    }

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
