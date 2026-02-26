export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, approvals, boardMemory, boards, tasks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/boards/[boardId]/snapshot
 * Get an aggregated board snapshot including board, tasks, agents, approvals, and chat messages.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId } = await params;

    // Fetch board
    const boardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!boardResult.length) {
      throw new ApiError(404, "Board not found");
    }

    // Fetch tasks
    const tasksResult = await db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, boardId));

    // Fetch agents
    const agentsResult = await db
      .select()
      .from(agents)
      .where(eq(agents.boardId, boardId));

    // Fetch approvals
    const approvalsResult = await db
      .select()
      .from(approvals)
      .where(eq(approvals.boardId, boardId));

    // Fetch chat messages (is_chat = true)
    const chatMessagesResult = await db
      .select()
      .from(boardMemory)
      .where(eq(boardMemory.boardId, boardId))
      .then((rows) => rows.filter((m) => m.isChat));

    // Count pending approvals
    const pendingApprovalsCount = approvalsResult.filter(
      (a) => a.status === "pending"
    ).length;

    const snapshot = {
      board: boardResult[0],
      tasks: tasksResult,
      agents: agentsResult,
      approvals: approvalsResult,
      chat_messages: chatMessagesResult,
      pending_approvals_count: pendingApprovalsCount,
    };

    return Response.json(snapshot);
  } catch (error) {
    return handleApiError(error);
  }
}
