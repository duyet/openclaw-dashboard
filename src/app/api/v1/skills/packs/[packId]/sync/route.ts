export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { skillPacks } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/skills/packs/:packId/sync
 * Trigger a sync of the skill pack.
 * Stub: updates updatedAt and returns a queued confirmation.
 * Real implementation would enqueue a Cloudflare Queue job.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select({ id: skillPacks.id })
      .from(skillPacks)
      .where(
        and(
          eq(skillPacks.id, packId),
          eq(skillPacks.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Skill pack not found");
    }

    const now = new Date().toISOString();

    await db
      .update(skillPacks)
      .set({ updatedAt: now })
      .where(eq(skillPacks.id, packId));

    return Response.json({ ok: true, synced_at: now, message: "Sync queued" });
  } catch (error) {
    return handleApiError(error);
  }
}
