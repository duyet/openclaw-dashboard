export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { boards, tasks, agents, approvals } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/v1/metrics
 * Return aggregate metrics for the active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, 'No active organization');
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
      .where(eq(approvals.status, 'pending'));

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
