export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import type { GatewaySession } from "@/lib/services/gateway-rpc";

/**
 * POST /api/v1/gateways/[gatewayId]/sessions/sync
 * Sync gateway session data into agent rows.
 *
 * Body: { sessions: GatewaySession[] }
 * Returns: { synced: number }
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

    for (const session of body.sessions) {
      if (!session.session_key) continue;

      // Check if an agent exists for this session before updating
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

      if (!match.length) continue;

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
    }

    return Response.json({ synced });
  } catch (error) {
    return handleApiError(error);
  }
}
