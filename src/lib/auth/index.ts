/**
 * Main auth resolver for edge runtime API routes.
 *
 * Supports two actor types:
 * - "user": Authenticated via Clerk JWT or local bearer token
 * - "agent": Authenticated via X-Agent-Token header
 *
 * Agent tokens are checked first. If no agent token, falls back to
 * user auth (Clerk or local depending on AUTH_MODE).
 */
export const runtime = "edge";

import type { Database } from "../db";
import { ApiError } from "../errors";
import { resolveAgentAuth } from "./agent";
import { resolveClerkAuth } from "./clerk";
import { resolveLocalAuth } from "./local";
import type { Actor } from "./types";

export type { Actor };

// Legacy ActorContext type — kept for backward compatibility with existing routes.
export type ActorContext = {
  type: "user" | "agent";
  userId?: string;
  agentId?: string;
  orgId?: string;
};

/**
 * Attempt to resolve an authenticated actor from the request.
 * Returns null if no valid credentials are found.
 *
 * Resolution order:
 * 1. X-Agent-Token header (agent auth)
 * 2. Clerk JWT (when AUTH_MODE=clerk or unset)
 * 3. Local bearer token (when AUTH_MODE=local)
 */
export async function resolveActorContext(
  request: Request,
  d1: D1Database
): Promise<ActorContext | null> {
  // 1. Check agent token first
  const agentContext = await resolveAgentAuth(request, d1);
  if (agentContext) return agentContext;

  // 2. Determine auth mode
  const authMode =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AUTH_MODE) ||
    "clerk";

  if (authMode === "local") {
    return resolveLocalAuth(request, d1);
  }

  // 3. Default: Clerk JWT
  return resolveClerkAuth(request, d1);
}

/**
 * Require an authenticated actor context.
 * Throws ApiError(401) if no valid credentials are found.
 */
export async function requireActorContext(
  request: Request,
  d1: D1Database
): Promise<ActorContext> {
  const ctx = await resolveActorContext(request, d1);
  if (!ctx) {
    throw new ApiError(401, "Unauthorized");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Spec-compatible Actor interface (resolveActor / requireActor)
// These accept a Database instance (drizzle) rather than raw D1Database.
// ---------------------------------------------------------------------------

/**
 * Resolve an authenticated Actor (typed union) from the request.
 * Returns null if no valid credentials are found.
 */
export async function resolveActor(
  request: Request,
  db: Database
): Promise<Actor | null> {
  try {
    const { resolveActorFromDb } = await import("./_resolve");
    return resolveActorFromDb(request, db);
  } catch {
    return null;
  }
}

/**
 * Require an authenticated Actor. Throws ApiError(401) if unauthenticated.
 */
export async function requireActor(
  request: Request,
  db: Database
): Promise<Actor> {
  const actor = await resolveActor(request, db);
  if (!actor) throw new ApiError(401, "Authentication required");
  return actor;
}
