export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { approvals } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/approvals
 * List approvals, optionally filtered by board_id and status.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const boardId = url.searchParams.get("board_id");
    const status = url.searchParams.get("status");

    let result = await db
      .select()
      .from(approvals)
      .orderBy(sql`${approvals.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    if (boardId) {
      result = result.filter((a) => a.boardId === boardId);
    }
    if (status) {
      result = result.filter((a) => a.status === status);
    }

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(approvals);

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}
