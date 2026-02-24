export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardOnboardingSessions, boards } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/boards/:boardId/onboarding/confirm
 * Apply the onboarding draft to the board and mark the session as completed.
 * Returns the updated BoardRead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const board = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    const body = (await request.json()) as {
      board_type?: string;
      objective?: string | null;
      success_metrics?: Record<string, unknown> | null;
      target_date?: string | null;
    };

    const now = new Date().toISOString();

    await db
      .update(boards)
      .set({
        boardType: body.board_type ?? board[0].boardType,
        objective: body.objective ?? null,
        successMetrics: body.success_metrics ?? null,
        targetDate: body.target_date ?? null,
        goalConfirmed: true,
        goalSource: "onboarding",
        updatedAt: now,
      })
      .where(eq(boards.id, boardId));

    // Mark any active onboarding session as completed
    await db
      .update(boardOnboardingSessions)
      .set({ status: "completed", updatedAt: now })
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      );

    const updated = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    return Response.json(updated[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
