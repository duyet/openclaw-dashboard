export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/agents/[agentId]/heartbeat
 * Record a heartbeat for a specific agent.
 * Agent-auth only (X-Agent-Token).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { agentId } = await params;

    // Only agents can send heartbeats
    if (actor.type !== 'agent') {
      throw new ApiError(403, 'Only agents can send heartbeats');
    }

    const existing = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Agent not found');
    }

    const now = new Date().toISOString();

    // Update last seen and status
    await db
      .update(agents)
      .set({
        lastSeenAt: now,
        status: 'online',
        updatedAt: now,
      })
      .where(eq(agents.id, agentId));

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
