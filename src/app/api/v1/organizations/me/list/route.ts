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

    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizationMembers.organizationId, organizations.id)
      )
      .where(eq(organizationMembers.userId, actor.userId));

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      is_active: row.id === actor.orgId,
    }));

    return Response.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
