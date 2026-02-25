export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardOnboardingSessions } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { callOnboardingAI } from "@/lib/onboarding-ai";

/**
 * POST /api/v1/boards/:boardId/onboarding/answer
 * Append a user answer to the active onboarding session.
 * Returns the updated BoardOnboardingRead.
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

    const session = await db
      .select()
      .from(boardOnboardingSessions)
      .where(
        and(
          eq(boardOnboardingSessions.boardId, boardId),
          eq(boardOnboardingSessions.status, "active")
        )
      )
      .orderBy(boardOnboardingSessions.createdAt)
      .limit(1);

    if (session.length === 0) {
      throw new ApiError(404, "No active onboarding session found");
    }

    const body = (await request.json()) as {
      answer?: string;
      other_text?: string | null;
    };

    const answer = (body.answer ?? "").trim();
    if (!answer) {
      throw new ApiError(422, "answer is required");
    }

    const content = body.other_text?.trim()
      ? `${answer}: ${body.other_text.trim()}`
      : answer;

    const existing = session[0];
    const previousMessages: Array<Record<string, unknown>> = Array.isArray(
      existing.messages
    )
      ? (existing.messages as Array<Record<string, unknown>>)
      : [];

    const now = new Date().toISOString();
    const updatedMessages = [
      ...previousMessages,
      { role: "user", content, timestamp: now },
    ];

    await db
      .update(boardOnboardingSessions)
      .set({ messages: updatedMessages, updatedAt: now })
      .where(eq(boardOnboardingSessions.id, existing.id));

    // Call AI to get the next question or complete draft
    const apiKey = process.env.OPENROUTER_API_KEY;
    let finalMessages: Array<Record<string, unknown>> = updatedMessages;
    let draftGoal: Record<string, unknown> | null = null;

    if (apiKey) {
      try {
        const aiMessages = updatedMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: String(m.content),
          }));

        const aiResult = await callOnboardingAI(aiMessages, apiKey);

        if (aiResult.type === "complete") {
          draftGoal = aiResult.draft as unknown as Record<string, unknown>;
        } else {
          const assistantMsg = {
            role: "assistant",
            content: aiResult.content,
            timestamp: new Date().toISOString(),
          };
          finalMessages = [...updatedMessages, assistantMsg];
        }

        await db
          .update(boardOnboardingSessions)
          .set({
            messages: finalMessages,
            draftGoal,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(boardOnboardingSessions.id, existing.id));
      } catch {
        // Non-fatal: UI will keep polling and can retry
      }
    }

    const result = await db
      .select()
      .from(boardOnboardingSessions)
      .where(eq(boardOnboardingSessions.id, existing.id))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
