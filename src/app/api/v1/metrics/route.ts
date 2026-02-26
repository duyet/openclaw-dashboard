export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, approvals, boards, tasks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/metrics
 * Return aggregate metrics for the active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const [boardCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(boards)
      .where(eq(boards.organizationId, actor.orgId));

    const [taskCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks);

    const [agentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agents);

    const [pendingApprovalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(approvals)
      .where(eq(approvals.status, "pending"));

    return Response.json({
      boards: boardCount?.count ?? 0,
      tasks: taskCount?.count ?? 0,
      agents: agentCount?.count ?? 0,
      pending_approvals: pendingApprovalCount?.count ?? 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
