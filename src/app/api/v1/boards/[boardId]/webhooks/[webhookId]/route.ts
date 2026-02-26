export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boardMemory,
  boards,
  boardWebhookPayloads,
  boardWebhooks,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

function webhookEndpointPath(boardId: string, webhookId: string): string {
  return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
}

/**
 * GET /api/v1/boards/[boardId]/webhooks/[webhookId]
 * Get one board webhook configuration.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string; webhookId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId, webhookId } = await params;

    const result = await db
      .select()
      .from(boardWebhooks)
      .where(
        and(eq(boardWebhooks.id, webhookId), eq(boardWebhooks.boardId, boardId))
      )
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, "Webhook not found");
    }

    return Response.json({
      ...result[0],
      endpoint_path: webhookEndpointPath(boardId, webhookId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/boards/[boardId]/webhooks/[webhookId]
 * Update webhook description or enabled state.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string; webhookId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId, webhookId } = await params;

    const existing = await db
      .select()
      .from(boardWebhooks)
      .where(
        and(eq(boardWebhooks.id, webhookId), eq(boardWebhooks.boardId, boardId))
      )
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, "Webhook not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.description !== undefined) updates.description = body.description;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.agent_id !== undefined) updates.agentId = body.agent_id;

    await db
      .update(boardWebhooks)
      .set(updates)
      .where(eq(boardWebhooks.id, webhookId));

    const result = await db
      .select()
      .from(boardWebhooks)
      .where(eq(boardWebhooks.id, webhookId))
      .limit(1);

    return Response.json({
      ...result[0],
      endpoint_path: webhookEndpointPath(boardId, webhookId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/boards/[boardId]/webhooks/[webhookId]
 * Delete a webhook and its stored payload rows.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string; webhookId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId, webhookId } = await params;

    const existing = await db
      .select()
      .from(boardWebhooks)
      .where(
        and(eq(boardWebhooks.id, webhookId), eq(boardWebhooks.boardId, boardId))
      )
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, "Webhook not found");
    }

    // Delete payloads first
    await db
      .delete(boardWebhookPayloads)
      .where(eq(boardWebhookPayloads.webhookId, webhookId));

    // Delete the webhook
    await db.delete(boardWebhooks).where(eq(boardWebhooks.id, webhookId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/[boardId]/webhooks/[webhookId]
 * Open inbound webhook endpoint (unauthenticated) that stores payloads.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string; webhookId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const { boardId, webhookId } = await params;

    // NOTE: This endpoint is unauthenticated (open inbound webhook)

    // Verify board exists
    const boardResult = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!boardResult.length) {
      throw new ApiError(404, "Board not found");
    }

    // Verify webhook exists and is enabled
    const webhookResult = await db
      .select()
      .from(boardWebhooks)
      .where(
        and(eq(boardWebhooks.id, webhookId), eq(boardWebhooks.boardId, boardId))
      )
      .limit(1);

    if (!webhookResult.length) {
      throw new ApiError(404, "Webhook not found");
    }

    const webhook = webhookResult[0];

    if (!webhook.enabled) {
      throw new ApiError(410, "Webhook is disabled.");
    }

    // Parse the incoming payload
    const contentType = request.headers.get("content-type");
    const rawBody = await request.text();

    let payloadValue: unknown = {};
    try {
      payloadValue = JSON.parse(rawBody);
    } catch {
      payloadValue = rawBody;
    }

    // Capture relevant headers
    const capturedHeaders: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      const normalized = key.toLowerCase();
      if (
        normalized === "content-type" ||
        normalized === "user-agent" ||
        normalized.startsWith("x-")
      ) {
        capturedHeaders[normalized] = value;
      }
    }

    const now = new Date().toISOString();
    const payloadId = crypto.randomUUID();
    const memoryId = crypto.randomUUID();

    // Store the payload
    await db.insert(boardWebhookPayloads).values({
      id: payloadId,
      boardId,
      webhookId,
      payload: payloadValue,
      headers: capturedHeaders as Record<string, string>,
      sourceIp: request.headers.get("cf-connecting-ip") || null,
      contentType,
      receivedAt: now,
    });

    // Store as board memory
    const preview =
      typeof payloadValue === "string"
        ? payloadValue
        : JSON.stringify(payloadValue, null, 2);

    await db.insert(boardMemory).values({
      id: memoryId,
      boardId,
      content:
        `WEBHOOK PAYLOAD RECEIVED\n` +
        `Webhook ID: ${webhookId}\n` +
        `Payload ID: ${payloadId}\n` +
        `Instruction: ${webhook.description}\n\n` +
        `Payload preview:\n${preview}`,
      tags: ["webhook", `webhook:${webhookId}`, `payload:${payloadId}`],
      source: "webhook",
      isChat: false,
      createdAt: now,
    });

    return Response.json(
      {
        board_id: boardId,
        webhook_id: webhookId,
        payload_id: payloadId,
      },
      { status: 202 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
