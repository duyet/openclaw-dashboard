export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardOnboardingSessions, boards } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/boards/:boardId/onboarding
 * Get the active onboarding session for a board (if any).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const result = await db
      .select()
      .from(boardOnboardingSessions)
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      )
      .orderBy(sql`${boardOnboardingSessions.createdAt} desc`)
      .limit(1);

    if (result.length === 0) {
      return Response.json(null);
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/:boardId/onboarding
 * Create a new onboarding session for a board.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    // Check for existing active session
    const existingSession = await db
      .select()
      .from(boardOnboardingSessions)
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      )
      .limit(1);

    if (existingSession.length > 0) {
      // Return existing session
      return Response.json(existingSession[0]);
    }

    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const sessionKey = crypto.randomUUID();

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    await db.insert(boardOnboardingSessions).values({
      id: sessionId,
      boardId,
      sessionKey,
      status: "active",
      messages: body.messages
        ? (body.messages as Array<Record<string, unknown>>)
        : null,
      draftGoal: body.draft_goal
        ? (body.draft_goal as Record<string, unknown>)
        : null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(boardOnboardingSessions)
      .where(eq(boardOnboardingSessions.id, sessionId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/boards/:boardId/onboarding
 * Update the active onboarding session (multi-step).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    // Find active session
    const session = await db
      .select()
      .from(boardOnboardingSessions)
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      )
      .orderBy(sql`${boardOnboardingSessions.createdAt} desc`)
      .limit(1);

    if (session.length === 0) {
      throw new ApiError(404, "No active onboarding session found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.messages !== undefined) {
      updates.messages = JSON.stringify(body.messages);
    }
    if (body.draft_goal !== undefined) {
      updates.draftGoal = JSON.stringify(body.draft_goal);
    }
    if (body.status !== undefined) {
      const validStatuses = ["active", "completed", "cancelled"];
      if (!validStatuses.includes(body.status as string)) {
        throw new ApiError(422, "Invalid session status");
      }
      updates.status = body.status;
    }

    await db
      .update(boardOnboardingSessions)
      .set(updates)
      .where(eq(boardOnboardingSessions.id, session[0].id));

    const result = await db
      .select()
      .from(boardOnboardingSessions)
      .where(eq(boardOnboardingSessions.id, session[0].id))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
