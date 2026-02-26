export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardMemory, boards } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/boards/[boardId]/memory
 * List board memory entries, optionally filtering chat entries.
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

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const isChat = url.searchParams.get("is_chat");

    let result = await db
      .select()
      .from(boardMemory)
      .where(eq(boardMemory.boardId, boardId))
      .orderBy(sql`${boardMemory.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    // Filter is_chat in-memory
    if (isChat !== null && isChat !== undefined) {
      const isChatBool = isChat === "true";
      result = result.filter((m) => m.isChat === isChatBool);
    }

    // Filter empty content
    result = result.filter((m) => m.content && m.content.trim().length > 0);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardMemory)
      .where(eq(boardMemory.boardId, boardId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/memory
 * Create a board memory entry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);
    const { boardId } = await params;

    // Verify the board exists
    const boardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!boardResult.length) {
      throw new ApiError(404, "Board not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const content = ((body.content as string) || "").trim();
    if (!content) {
      throw new ApiError(422, "Content is required");
    }

    const tags: string[] | null = (body.tags as string[]) || null;
    const isChat = tags ? tags.includes("chat") : false;

    let source: string | null = (body.source as string) || null;
    if (isChat && !source) {
      if (actor.type === "agent") {
        source = actor.agentId || "agent";
      } else {
        source = "User";
      }
    }

    const now = new Date().toISOString();
    const memoryId = crypto.randomUUID();

    await db.insert(boardMemory).values({
      id: memoryId,
      boardId,
      content,
      tags,
      isChat,
      source,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(boardMemory)
      .where(eq(boardMemory.id, memoryId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/boards/[boardId]/memory
 * Delete a memory entry by ID (passed as query param ?id=...).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId } = await params;

    const url = new URL(request.url);
    const memoryId = url.searchParams.get("id");

    if (!memoryId) {
      throw new ApiError(422, "Memory entry id is required as query param");
    }

    const existing = await db
      .select({ id: boardMemory.id })
      .from(boardMemory)
      .where(
        and(eq(boardMemory.id, memoryId), eq(boardMemory.boardId, boardId))
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Memory entry not found");
    }

    await db.delete(boardMemory).where(eq(boardMemory.id, memoryId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
