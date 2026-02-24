export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardOnboardingSessions, boards } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/boards/:boardId/onboarding/start
 * Create a new onboarding session (or return an existing active one).
 * Returns a BoardOnboardingRead.
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

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    // Return existing active session if present
    const existing = await db
      .select()
      .from(boardOnboardingSessions)
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return Response.json(existing[0]);
    }

    // Create new session
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const sessionKey = crypto.randomUUID();

    await db.insert(boardOnboardingSessions).values({
      id: sessionId,
      boardId,
      sessionKey,
      status: "active",
      messages: null,
      draftGoal: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(boardOnboardingSessions)
      .where(eq(boardOnboardingSessions.id, sessionId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
