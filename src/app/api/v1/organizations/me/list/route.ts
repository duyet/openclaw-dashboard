export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, inArray } from "drizzle-orm";
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

    const rows = await db
      .select({
        id: organizationMembers.organizationId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, actor.userId));

    // Fetch organization names in parallel
    const orgIds = rows.map((r) => r.id);
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));

    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    const data = rows.map((row) => ({
      id: row.id,
      name: orgMap.get(row.id) ?? "",
      role: row.role,
      is_active: row.id === actor.orgId,
    }));

    return Response.json({ data, status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
