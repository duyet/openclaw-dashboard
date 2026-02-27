export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gateways } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/gateways/[gatewayId]/pair
 * Approve a device pairing request: store the device token on the gateway.
 *
 * Body: { device_token: string }
 * Returns: { approved: true, gateway_id: string }
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

    const body = (await request.json()) as { device_token?: string };
    if (!body.device_token || typeof body.device_token !== "string") {
      throw new ApiError(422, "device_token is required");
    }

    const now = new Date().toISOString();

    await db
      .update(gateways)
      .set({
        deviceToken: body.device_token,
        deviceTokenGrantedAt: now,
        updatedAt: now,
      })
      .where(eq(gateways.id, gatewayId));

    return Response.json({ approved: true, gateway_id: gatewayId });
  } catch (error) {
    return handleApiError(error);
  }
}
