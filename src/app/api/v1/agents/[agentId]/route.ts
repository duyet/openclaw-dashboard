export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { agents, tasks, activityEvents, approvals } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/v1/agents/[agentId]
 * Get a single agent by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { agentId } = await params;

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, 'Agent not found');
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/agents/[agentId]
 * Update agent metadata.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { agentId } = await params;

    const existing = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Agent not found');
    }

    const body = await request.json() as Record<string, unknown>;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.board_id !== undefined) updates.boardId = body.board_id;
    if (body.openclaw_session_id !== undefined)
      updates.openclawSessionId = body.openclaw_session_id;
    if (body.heartbeat_config !== undefined)
      updates.heartbeatConfig = JSON.stringify(body.heartbeat_config);
    if (body.identity_profile !== undefined)
      updates.identityProfile = JSON.stringify(body.identity_profile);
    if (body.identity_template !== undefined)
      updates.identityTemplate = body.identity_template;
    if (body.soul_template !== undefined) updates.soulTemplate = body.soul_template;
    if (body.is_board_lead !== undefined) updates.isBoardLead = body.is_board_lead;

    await db.update(agents).set(updates).where(eq(agents.id, agentId));

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

/**
 * DELETE /api/v1/agents/[agentId]
 * Delete an agent and clean related task state.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { agentId } = await params;

    if (actor.type !== 'user') {
      throw new ApiError(403, 'Only users can delete agents');
    }

    const existing = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, 'Agent not found');
    }

    // Clear agent assignment from tasks
    const agentTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.assignedAgentId, agentId));

    for (const task of agentTasks) {
      await db
        .update(tasks)
        .set({
          assignedAgentId: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tasks.id, task.id));
    }

    // Delete the agent
    await db.delete(agents).where(eq(agents.id, agentId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
