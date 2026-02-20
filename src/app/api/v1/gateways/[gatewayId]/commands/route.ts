export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { gateways } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/errors';
import {
  executeCommand,
  sendMessage,
  type GatewayConfig,
} from '@/lib/services/gateway-rpc';
import { eq } from 'drizzle-orm';

/**
 * Resolve a GatewayConfig from a gateway row.
 */
function toGatewayConfig(gateway: {
  url: string;
  token: string | null;
}): GatewayConfig {
  let wsUrl = gateway.url;
  if (wsUrl.startsWith('https://')) {
    wsUrl = wsUrl.replace('https://', 'wss://');
  } else if (wsUrl.startsWith('http://')) {
    wsUrl = wsUrl.replace('http://', 'ws://');
  }
  return { url: wsUrl, token: gateway.token };
}

/**
 * POST /api/v1/gateways/[gatewayId]/commands
 * Execute a command or send a message on a gateway session.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> },
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
      throw new ApiError(404, 'Gateway not found');
    }

    const body = await request.json() as Record<string, unknown>;
    const config = toGatewayConfig(gatewayResult[0]);

    // Support two modes: command execution or message sending
    if (body.type === 'message') {
      if (!body.session_key || !body.agent_name || !body.message) {
        throw new ApiError(
          422,
          'session_key, agent_name, and message are required for message type',
        );
      }
      const result = await sendMessage(config, {
        session_key: body.session_key as string,
        agent_name: body.agent_name as string,
        message: body.message as string,
        deliver: body.deliver as boolean | undefined,
      });
      return Response.json(result);
    }

    // Default: command execution
    if (!body.session_key || !body.command) {
      throw new ApiError(422, 'session_key and command are required');
    }

    const result = await executeCommand(config, {
      session_key: body.session_key as string,
      command: body.command as string,
      args: body.args as string[] | undefined,
      cwd: body.cwd as string | undefined,
    });

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
