/**
 * Edge-compatible Clerk JWT verification.
 *
 * Uses @clerk/nextjs/server for JWT verification on edge runtime.
 * Falls back gracefully if Clerk is not configured.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { ActorContext } from "./index";
import type { Actor } from "./types";

/**
 * Extract a bearer token from the Authorization header.
 */
function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const trimmed = authorization.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

/**
 * Env type matching Cloudflare Pages runtime bindings.
 */
type CfEnv =
  | {
      CLERK_SECRET_KEY?: string;
      [key: string]: unknown;
    }
  | CloudflareEnv;

/**
 * Resolve user auth context from a Clerk JWT.
 *
 * Attempts to verify the JWT using Clerk's edge-compatible verification.
 * If verification succeeds, looks up or creates the user in the DB.
 *
 * @param request - The incoming request
 * @param d1 - The D1 database binding
 * @param env - Cloudflare env bindings (contains CLERK_SECRET_KEY at runtime)
 */
export async function resolveClerkAuth(
  request: Request,
  d1: D1Database,
  env?: CfEnv
): Promise<ActorContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  // Phase 1: verify JWT — errors here mean unauthenticated (return null).
  let clerkUserId: string;
  let clerkEmail: string | undefined;
  let clerkName: string | undefined;
  try {
    // Dynamic import to avoid issues when Clerk is not configured
    const { verifyToken } = await import("@clerk/nextjs/server");

    // On Cloudflare Workers edge, CLERK_SECRET_KEY is in env, not process.env
    // Fallback to process.env for local dev with Next.js dev server
    const secretKey =
      env?.CLERK_SECRET_KEY ??
      (typeof process !== "undefined"
        ? process.env?.CLERK_SECRET_KEY
        : undefined);
    if (!secretKey) return null;

    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

    clerkUserId = payload.sub;
    const claims = payload as Record<string, unknown>;
    clerkEmail = (claims.email ?? claims.primary_email_address) as
      | string
      | undefined;
    clerkName = (claims.name ?? claims.first_name) as string | undefined;
  } catch {
    // JWT verification failed — caller is unauthenticated.
    return null;
  }

  // Phase 2: DB lookup — errors here are infrastructure failures, let them
  // bubble up so the route handler returns 500 instead of 401.
  const db = getDb(d1);

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      type: "user",
      userId: existingUser[0].id,
      orgId: existingUser[0].activeOrganizationId ?? undefined,
    };
  }

  // User not found — auto-bootstrap: create user + org on first access.
  try {
    const { bootstrapClerkUser } = await import("./bootstrap-user");
    const newUser = await bootstrapClerkUser(db, {
      type: "user",
      clerkId: clerkUserId,
      clerkEmail,
      clerkName,
    });
    return {
      type: "user",
      userId: newUser.id,
      orgId: newUser.activeOrganizationId ?? undefined,
      clerkId: clerkUserId,
      clerkEmail,
      clerkName,
    };
  } catch {
    // If bootstrap fails, fall back to claims-only context so the
    // explicit /auth/bootstrap endpoint can still be used.
    return {
      type: "user",
      userId: undefined,
      clerkId: clerkUserId,
      clerkEmail,
      clerkName,
    };
  }
}

/**
 * Spec-compatible export: verify Clerk token and return Actor | null.
 * Uses a Drizzle Database instance rather than raw D1Database.
 */
export async function verifyClerkToken(
  request: Request,
  db: Database,
  env?: CfEnv
): Promise<Actor | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { verifyToken } = await import("@clerk/nextjs/server");
    const secretKey =
      env?.CLERK_SECRET_KEY ??
      (typeof process !== "undefined"
        ? process.env?.CLERK_SECRET_KEY
        : undefined);
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

    const clerkUserId = payload.sub;
    const user = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .get();
    if (!user) return null;

    return {
      type: "user",
      userId: user.id,
      clerkId: clerkUserId,
      orgId: user.activeOrganizationId ?? undefined,
    } satisfies Actor;
  } catch {
    return null;
  }
}
