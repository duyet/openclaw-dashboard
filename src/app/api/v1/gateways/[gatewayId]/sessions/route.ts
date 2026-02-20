export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import {
  createSession,
  deleteSession,
  type GatewayConfig,
  getSession,
  getSessions,
} from "@/lib/services/gateway-rpc";

/**
 * Resolve a GatewayConfig from a gateway row.
 */
function toGatewayConfig(gateway: {
  url: string;
  token: string | null;
}): GatewayConfig {
  // Convert HTTP URL to WebSocket URL
  let wsUrl = gateway.url;
  if (wsUrl.startsWith("https://")) {
    wsUrl = wsUrl.replace("https://", "wss://");
  } else if (wsUrl.startsWith("http://")) {
    wsUrl = wsUrl.replace("http://", "ws://");
  }
  return { url: wsUrl, token: gateway.token };
}

/**
 * GET /api/v1/gateways/[gatewayId]/sessions
 * List sessions on the gateway runtime.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { gatewayId } = await params;

    const gatewayResult = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!gatewayResult.length) {
      throw new ApiError(404, "Gateway not found");
    }

    const config = toGatewayConfig(gatewayResult[0]);

    const url = new URL(request.url);
    const sessionKey = url.searchParams.get("session_key");

    if (sessionKey) {
      const result = await getSession(config, sessionKey);
      return Response.json(result);
    }

    const sessions = await getSessions(config);
    return Response.json(sessions);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/gateways/[gatewayId]/sessions
 * Create a session on the gateway runtime.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { gatewayId } = await params;

    const gatewayResult = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!gatewayResult.length) {
      throw new ApiError(404, "Gateway not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.session_key || !body.agent_name) {
      throw new ApiError(422, "session_key and agent_name are required");
    }

    const config = toGatewayConfig(gatewayResult[0]);
    const result = await createSession(config, {
      session_key: body.session_key as string,
      agent_name: body.agent_name as string,
      workspace_root:
        (body.workspace_root as string) || gatewayResult[0].workspaceRoot,
      identity_template: body.identity_template as string | undefined,
      soul_template: body.soul_template as string | undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/gateways/[gatewayId]/sessions
 * Delete a session on the gateway runtime.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { gatewayId } = await params;

    const gatewayResult = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!gatewayResult.length) {
      throw new ApiError(404, "Gateway not found");
    }

    const url = new URL(request.url);
    const sessionKey = url.searchParams.get("session_key");
    if (!sessionKey) {
      throw new ApiError(422, "session_key query parameter is required");
    }

    const config = toGatewayConfig(gatewayResult[0]);
    const result = await deleteSession(config, sessionKey);

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
