export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, isNull } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents, gatewayInstalledSkills, gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/gateways/[gatewayId]
 * Return one gateway by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { gatewayId } = await params;

    const result = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!result.length) {
      throw new ApiError(404, "Gateway not found");
    }

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/gateways/[gatewayId]
 * Patch a gateway.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { gatewayId } = await params;

    const existing = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, "Gateway not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name;
    if (body.url !== undefined) updates.url = body.url;
    if (body.token !== undefined) updates.token = body.token;
    if (body.workspace_root !== undefined)
      updates.workspaceRoot = body.workspace_root;

    await db.update(gateways).set(updates).where(eq(gateways.id, gatewayId));

    const result = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    return Response.json(result[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/gateways/[gatewayId]
 * Delete a gateway.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ gatewayId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);
    const { gatewayId } = await params;

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can delete gateways");
    }

    const existing = await db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId))
      .limit(1);

    if (!existing.length) {
      throw new ApiError(404, "Gateway not found");
    }

    // Delete main agent(s) for this gateway
    const mainAgents = await db
      .select()
      .from(agents)
      .where(and(eq(agents.gatewayId, gatewayId), isNull(agents.boardId)));

    for (const agent of mainAgents) {
      await db.delete(agents).where(eq(agents.id, agent.id));
    }

    // Delete installed skills
    await db
      .delete(gatewayInstalledSkills)
      .where(eq(gatewayInstalledSkills.gatewayId, gatewayId));

    // Delete the gateway
    await db.delete(gateways).where(eq(gateways.id, gatewayId));

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
