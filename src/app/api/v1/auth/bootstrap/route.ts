export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * POST /api/v1/auth/bootstrap
 *
 * Resolve caller identity from auth headers and return the canonical user profile.
 * Creates the user record if it does not yet exist (Clerk flow).
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user") {
      throw new ApiError(401, "Unauthorized");
    }

    if (!actor.userId) {
      throw new ApiError(401, "User not found. Please sign up first.");
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);

    if (user.length === 0) {
      throw new ApiError(404, "User not found");
    }

    return Response.json(user[0]);
  } catch (error) {
    return handleApiError(error);
  }
}
