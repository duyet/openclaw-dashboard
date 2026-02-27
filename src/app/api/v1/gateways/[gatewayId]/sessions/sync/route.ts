export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import type { GatewaySession } from "@/lib/services/gateway-rpc";

/** Generate UUID for edge runtime (no crypto.randomUUID() in edge) */
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * POST /api/v1/gateways/[gatewayId]/sessions/sync
 * Sync gateway session data into agent rows.
 * Creates new agents from sessions that don't have a matching agent.
 *
 * Body: { sessions: GatewaySession[] }
 * Returns: { synced: number, created: number }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { gatewayId } = await params;

    const gatewayResult = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!gatewayResult.length) {
      throw new ApiError(404, "Gateway not found");
    }

    const body = (await request.json()) as { sessions?: GatewaySession[] };
    if (!Array.isArray(body.sessions)) {
      throw new ApiError(422, "sessions array is required");
    }

    const now = new Date().toISOString();
    let synced = 0;
    let created = 0;

    for (const session of body.sessions) {
      if (!session.session_key) continue;

      // Check if an agent exists for this session
      const match = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.gatewayId, gatewayId),
            eq(agents.openclawSessionId, session.session_key)
          )
        )
        .limit(1);

      if (match.length) {
        // Update existing agent
        await db
          .update(agents)
          .set({
            sessionStatus: session.status ?? null,
            sessionLastActivityAt: session.last_activity_at ?? null,
            sessionSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(agents.id, match[0].id));
        synced++;
      } else {
        // Create new agent from session
        // Extract agent name from session
        const agentName =
          session.displayName || session.label || session.session_key;

        // Map session status to agent status
        const agentStatus = session.status === "active" ? "online" : "offline";

        await db.insert(agents).values({
          id: uuidv4(),
          gatewayId,
          name: agentName,
          status: agentStatus,
          openclawSessionId: session.session_key,
          sessionStatus: session.status ?? null,
          sessionLastActivityAt: session.last_activity_at ?? null,
          sessionSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return Response.json({ synced, created });
  } catch (error) {
    return handleApiError(error);
  }
}
