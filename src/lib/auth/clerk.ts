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
 * Resolve user auth context from a Clerk JWT.
 *
 * Attempts to verify the JWT using Clerk's edge-compatible verification.
 * If verification succeeds, looks up or creates the user in the DB.
 */
export async function resolveClerkAuth(
  request: Request,
  d1: D1Database
): Promise<ActorContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    // Dynamic import to avoid issues when Clerk is not configured
    const { verifyToken } = await import("@clerk/nextjs/server");

    const secretKey =
      typeof process !== "undefined"
        ? process.env?.CLERK_SECRET_KEY
        : undefined;
    if (!secretKey) return null;

    const payload = await verifyToken(token, {
      secretKey,
    });

    if (!payload?.sub) return null;

    const clerkUserId = payload.sub;
    const db = getDb(d1);

    // Look up user by clerk_user_id
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

    // User not found — pass Clerk claims so bootstrap can create the record.
    const claims = payload as Record<string, unknown>;
    return {
      type: "user",
      userId: undefined, // No DB user yet
      clerkId: clerkUserId,
      clerkEmail: (claims.email ?? claims.primary_email_address) as
        | string
        | undefined,
      clerkName: (claims.name ?? claims.first_name) as string | undefined,
    };
  } catch {
    // JWT verification failed
    return null;
  }
}

/**
 * Spec-compatible export: verify Clerk token and return Actor | null.
 * Uses a Drizzle Database instance rather than raw D1Database.
 */
export async function verifyClerkToken(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { verifyToken } = await import("@clerk/nextjs/server");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
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
