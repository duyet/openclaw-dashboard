export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { requireActorContext } from "@/lib/auth";
import { bootstrapClerkUser } from "@/lib/auth/bootstrap-user";
import { getDb } from "@/lib/db";
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

    const user = await bootstrapClerkUser(db, actor);

    // Return 201 only for newly created users (no userId on the actor means
    // the DB record did not exist before this call).
    const isNew = !actor.userId;
    return Response.json(user, { status: isNew ? 201 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
