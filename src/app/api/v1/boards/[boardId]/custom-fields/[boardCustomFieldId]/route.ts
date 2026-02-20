export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boards, boardTaskCustomFields } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * DELETE /api/v1/boards/:boardId/custom-fields/:boardCustomFieldId
 * Unbind a custom field from a board.
 */
export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ boardId: string; boardCustomFieldId: string }> }
) {
  try {
    const { boardId, boardCustomFieldId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can unbind custom fields");
    }

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    // Find the binding
    const existing = await db
      .select({ id: boardTaskCustomFields.id })
      .from(boardTaskCustomFields)
      .where(
        and(
          eq(boardTaskCustomFields.id, boardCustomFieldId),
          eq(boardTaskCustomFields.boardId, boardId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Custom field binding not found");
    }

    await db
      .delete(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.id, boardCustomFieldId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
