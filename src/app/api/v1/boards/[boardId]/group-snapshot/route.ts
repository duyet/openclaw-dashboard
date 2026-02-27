export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boardGroups,
  boards,
  organizationMembers,
  tasks,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

interface BoardGroupTaskSummary {
  id: string;
  status: string;
  count: number;
}

interface BoardGroupBoardSnapshot {
  board: typeof boards.$inferSelect;
  task_summary?: BoardGroupTaskSummary[];
}

interface BoardGroupSnapshot {
  group?: typeof boardGroups.$inferSelect | null;
  boards?: BoardGroupBoardSnapshot[];
}

/**
 * GET /api/v1/boards/[boardId]/group-snapshot
 * Get a grouped snapshot across related boards in the same board_group_id.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);
    const { boardId } = await params;

    // Parse query params
    const url = new URL(request.url);
    const includeSelf = url.searchParams.get("include_self") !== "false";
    const includeDone = url.searchParams.get("include_done") !== "false";
    const perBoardTaskLimit = Math.min(
      parseInt(url.searchParams.get("per_board_task_limit") || "100", 10),
      1000
    );

    // Fetch source board to get boardGroupId and organizationId
    const sourceBoardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!sourceBoardResult.length) {
      throw new ApiError(404, "Board not found");
    }

    const sourceBoard = sourceBoardResult[0];

    // Verify actor is a member of the board's organization (user only)
    if (actor.type === "user" && actor.userId) {
      const memberCheck = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, sourceBoard.organizationId),
            eq(organizationMembers.userId, actor.userId)
          )
        )
        .limit(1);

      if (!memberCheck.length) {
        throw new ApiError(403, "Not a member of this organization");
      }
    }

    const boardGroupId = sourceBoard.boardGroupId;

    // If board has no group, return minimal response with just the source board
    if (!boardGroupId) {
      const taskSummary = await getTaskSummaryForBoard(
        db,
        boardId,
        includeDone,
        perBoardTaskLimit
      );

      const response: BoardGroupSnapshot = {
        group: null,
        boards: [
          {
            board: sourceBoard,
            task_summary: taskSummary,
          },
        ],
      };
      return Response.json(response);
    }

    // Fetch board group
    const groupResult = await db
      .select()
      .from(boardGroups)
      .where(eq(boardGroups.id, boardGroupId))
      .limit(1);

    // Fetch all boards in the same group
    const groupBoardsResult = await db
      .select()
      .from(boards)
      .where(eq(boards.boardGroupId, boardGroupId));

    // Filter boards based on include_self flag
    const boardsToFetch = includeSelf
      ? groupBoardsResult
      : groupBoardsResult.filter((b) => b.id !== boardId);

    // Build board snapshots with task summaries in parallel
    const boardSnapshots: BoardGroupBoardSnapshot[] = await Promise.all(
      boardsToFetch.map(async (board) => {
        const taskSummary = await getTaskSummaryForBoard(
          db,
          board.id,
          includeDone,
          perBoardTaskLimit
        );

        return {
          board,
          task_summary: taskSummary,
        };
      })
    );

    const response: BoardGroupSnapshot = {
      group: groupResult[0] || null,
      boards: boardSnapshots,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Fetch task summary grouped by status for a single board.
 */
async function getTaskSummaryForBoard(
  db: ReturnType<typeof getDb>,
  boardId: string,
  includeDone: boolean,
  limit: number
): Promise<BoardGroupTaskSummary[]> {
  const conditions = [eq(tasks.boardId, boardId)];

  if (!includeDone) {
    // Exclude "done" and "cancelled" statuses
    conditions.push(
      sql`(tasks.status != 'done' AND tasks.status != 'cancelled')`
    );
  }

  const result = await db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(tasks)
    .where(and(...conditions))
    .groupBy(tasks.status)
    .limit(limit);

  return result.map((row) => ({
    id: `${boardId}-${row.status}`,
    status: row.status,
    count: row.count,
  }));
}
