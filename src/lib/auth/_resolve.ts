/**
 * Internal actor resolver that works with a Drizzle Database instance.
 *
 * Implements the spec-required resolveActor/requireActor interface
 * using the same PBKDF2-based token verification as the Python backend.
 */

import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";
import type { Actor } from "./types";

const HASH_ALGORITHM = "SHA-256";
const KEY_LENGTH_BYTES = 32;

function base64UrlDecode(input: string): Uint8Array {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyPbkdf2Token(
  token: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4) return false;
  const [algorithm, iterationsStr, saltB64, digestB64] = parts;
  if (algorithm !== "pbkdf2_sha256") return false;
  const iterations = parseInt(iterationsStr, 10);
  if (Number.isNaN(iterations) || iterations <= 0) return false;

  const salt = base64UrlDecode(saltB64);
  const expectedDigest = base64UrlDecode(digestB64);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8
  );
  const candidate = new Uint8Array(derivedBits);
  if (candidate.length !== expectedDigest.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate[i] ^ expectedDigest[i];
  }
  return diff === 0;
}

async function resolveAgentActor(
  token: string,
  db: Database
): Promise<Actor | null> {
  const agentsWithTokens = await db
    .select({
      id: schema.agents.id,
      boardId: schema.agents.boardId,
      agentTokenHash: schema.agents.agentTokenHash,
    })
    .from(schema.agents)
    .where(isNotNull(schema.agents.agentTokenHash));

  for (const agent of agentsWithTokens) {
    if (!agent.agentTokenHash) continue;
    const valid = await verifyPbkdf2Token(token, agent.agentTokenHash);
    if (valid) {
      // Best-effort presence touch
      const now = new Date().toISOString();
      db.update(schema.agents)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(schema.agents.id, agent.id))
        .run()
        .catch(() => undefined);

      return {
        type: "agent",
        agentId: agent.id,
      };
    }
  }
  return null;
}

async function resolveClerkActorDb(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { verifyToken } = await import("@clerk/nextjs/server");
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;

    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

    const clerkUserId = payload.sub;
    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user[0]) return null;

    return {
      type: "user",
      userId: user[0].id,
      clerkId: clerkUserId,
      orgId: user[0].activeOrganizationId ?? undefined,
    };
  } catch {
    return null;
  }
}

async function resolveLocalActorDb(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const localToken = process.env.LOCAL_AUTH_TOKEN;
  if (!localToken) return null;

  // Timing-safe comparison
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(token);
  const bBytes = encoder.encode(localToken);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("compare-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, aBytes),
    crypto.subtle.sign("HMAC", key, bBytes),
  ]);
  const a32 = new Uint8Array(sigA);
  const b32 = new Uint8Array(sigB);
  if (a32.length !== b32.length) return null;
  let diff = 0;
  for (let i = 0; i < a32.length; i++) diff |= a32[i] ^ b32[i];
  if (diff !== 0) return null;

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, "local"))
    .limit(1);

  if (!user[0]) return null;

  return {
    type: "user",
    userId: user[0].id,
    clerkId: "local",
    orgId: user[0].activeOrganizationId ?? undefined,
  };
}

export async function resolveActorFromDb(
  request: Request,
  db: Database
): Promise<Actor | null> {
  // 1. Agent token check
  const agentToken = request.headers.get("X-Agent-Token");
  if (agentToken) {
    return resolveAgentActor(agentToken.trim(), db);
  }

  // 2. User auth based on AUTH_MODE
  const authMode =
    process.env.AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "clerk";
  if (authMode === "local") {
    return resolveLocalActorDb(request, db);
  }
  return resolveClerkActorDb(request, db);
}
