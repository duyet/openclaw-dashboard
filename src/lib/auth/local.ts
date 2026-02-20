/**
 * Local token auth for development/self-hosted deployments.
 *
 * Uses timing-safe comparison via crypto.subtle to verify the bearer
 * token matches the LOCAL_AUTH_TOKEN environment variable.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { ActorContext } from "./index";
import type { Actor } from "./types";

const LOCAL_AUTH_USER_CLERK_ID = "local-auth-user";

/**
 * Timing-safe string comparison using crypto.subtle.
 * Falls back to basic comparison if crypto.subtle is unavailable.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Use HMAC for timing-safe comparison
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32), // fixed key - we only care about timing safety
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, aBytes),
    crypto.subtle.sign("HMAC", key, bBytes),
  ]);

  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  if (arrA.length !== arrB.length) return false;
  let result = 0;
  for (let i = 0; i < arrA.length; i++) {
    result |= arrA[i] ^ arrB[i];
  }
  return result === 0;
}

/**
 * Resolve user auth context from a local bearer token.
 *
 * Validates the Authorization: Bearer <token> against LOCAL_AUTH_TOKEN
 * env var using timing-safe comparison.
 */
export async function resolveLocalAuth(
  request: Request,
  d1: D1Database
): Promise<ActorContext | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const trimmed = authorization.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  if (!token) return null;

  const expectedToken =
    typeof process !== "undefined" ? process.env?.LOCAL_AUTH_TOKEN : undefined;
  if (!expectedToken) return null;

  const isValid = await timingSafeEqual(token, expectedToken.trim());
  if (!isValid) return null;

  // Look up or identify the local user
  const db = getDb(d1);
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, LOCAL_AUTH_USER_CLERK_ID))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      type: "user",
      userId: existingUser[0].id,
      orgId: existingUser[0].activeOrganizationId ?? undefined,
    };
  }

  // Local user not yet created - bootstrap endpoint will handle this
  return {
    type: "user",
    userId: undefined,
  };
}

/**
 * Spec-compatible export: verify local token and return Actor | null.
 * Uses a Drizzle Database instance rather than raw D1Database.
 */
export async function verifyLocalToken(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const localToken = process.env.LOCAL_AUTH_TOKEN;
  if (!localToken) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("compare-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(token)),
    crypto.subtle.sign("HMAC", key, encoder.encode(localToken)),
  ]);
  const a32 = new Uint8Array(sigA);
  const b32 = new Uint8Array(sigB);
  if (a32.length !== b32.length) return null;
  let diff = 0;
  for (let i = 0; i < a32.length; i++) diff |= a32[i] ^ b32[i];
  if (diff !== 0) return null;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, "local"))
    .get();
  if (!user) return null;

  return {
    type: "user",
    userId: user.id,
    clerkId: "local",
    orgId: user.activeOrganizationId ?? undefined,
  } satisfies Actor;
}
