export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardGroupMemory, boardGroups } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/board-groups/:groupId/memory
 * List memory entries for a board group.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(boardGroupMemory)
      .where(eq(boardGroupMemory.boardGroupId, groupId))
      .orderBy(sql`${boardGroupMemory.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardGroupMemory)
      .where(eq(boardGroupMemory.boardGroupId, groupId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/board-groups/:groupId/memory
 * Create a memory entry for a board group.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    // Verify board group exists
    const group = await db
      .select({ id: boardGroups.id })
      .from(boardGroups)
      .where(eq(boardGroups.id, groupId))
      .limit(1);

    if (group.length === 0) {
      throw new ApiError(404, "Board group not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.content) {
      throw new ApiError(422, "content is required");
    }

    const now = new Date().toISOString();
    const memoryId = crypto.randomUUID();

    await db.insert(boardGroupMemory).values({
      id: memoryId,
      boardGroupId: groupId,
      content: body.content as string,
      tags: body.tags ? (body.tags as string[]) : null,
      isChat: (body.is_chat as boolean) ?? false,
      source: (body.source as string) || null,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(boardGroupMemory)
      .where(eq(boardGroupMemory.id, memoryId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/board-groups/:groupId/memory
 * Delete a memory entry by ID (passed as query param ?id=...).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const memoryId = url.searchParams.get("id");

    if (!memoryId) {
      throw new ApiError(422, "Memory entry id is required as query param");
    }

    const existing = await db
      .select({ id: boardGroupMemory.id })
      .from(boardGroupMemory)
      .where(
        and(
          eq(boardGroupMemory.id, memoryId),
          eq(boardGroupMemory.boardGroupId, groupId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Memory entry not found");
    }

    await db.delete(boardGroupMemory).where(eq(boardGroupMemory.id, memoryId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
