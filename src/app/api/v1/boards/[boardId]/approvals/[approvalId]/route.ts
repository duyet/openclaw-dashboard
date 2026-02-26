export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { approvals } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/boards/:boardId/approvals/:approvalId
 * Get a single approval.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string; approvalId: string }> }
) {
  try {
    const { boardId, approvalId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const result = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.boardId, boardId)))
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Approval not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/boards/:boardId/approvals/:approvalId
 * Update an approval status (approve/reject).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string; approvalId: string }> }
) {
  try {
    const { boardId, approvalId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const existing = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.boardId, boardId)))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Approval not found");
    }

    if (existing[0].status !== "pending") {
      throw new ApiError(409, "Approval has already been resolved");
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (
      !body.status ||
      (body.status !== "approved" && body.status !== "rejected")
    ) {
      throw new ApiError(422, 'status must be "approved" or "rejected"');
    }

    const now = new Date().toISOString();

    await db
      .update(approvals)
      .set({
        status: body.status as "approved" | "rejected",
        resolvedAt: now,
      })
      .where(eq(approvals.id, approvalId));

    const result = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
