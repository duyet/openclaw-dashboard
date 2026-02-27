export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/organizations/me/list
 * List all organizations the current user belongs to, with role and active flag.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (actor.type !== "user" || !actor.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Fetch memberships and all organizations in parallel
    const [memberships, allOrgs] = await Promise.all([
      db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, actor.userId)),
      db.select().from(organizations),
    ]);

    // Create org map for lookup
    const orgMap = new Map(allOrgs.map((o) => [o.id, o]));

    // Join memberships with org data
    const data = memberships.map((m) => ({
      id: m.organizationId,
      name: orgMap.get(m.organizationId)?.name ?? "",
      role: m.role,
      is_active: m.organizationId === actor.orgId,
    }));

    return Response.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
