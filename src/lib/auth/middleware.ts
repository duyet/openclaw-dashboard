/**
 * Server-side auth helpers for Next.js Route Handlers (edge runtime).
 *
 * This module provides a single `authenticate` function that resolves the
 * authenticated actor from an incoming Request and returns typed user/agent
 * info, or throws a Response (not an Error) so callers can propagate it
 * directly:
 *
 *   ```ts
 *   export async function GET(req: Request) {
 *     try {
 *       const actor = await authenticate(req, db);
 *       ...
 *     } catch (res) {
 *       if (res instanceof Response) return res;
 *       throw res;
 *     }
 *   }
 *   ```
 *
 * Authentication resolution order:
 *   1. X-Agent-Token header   → PBKDF2-SHA256 hash compare against DB
 *   2. AUTH_MODE=local         → Authorization: Bearer <token> compared
 *                                 timing-safely against LOCAL_AUTH_TOKEN env var
 *   3. AUTH_MODE=clerk (default) → Clerk JWT via @clerk/nextjs/server verifyToken
 *
 * Edge-runtime safe: uses only `crypto.subtle`, no Node.js built-ins.
 */

import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";
import { unauthorized } from "../errors";
import type { Actor } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the raw token from an "Authorization: Bearer <token>" header. */
function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

/** Decode URL-safe base64 (no padding) to Uint8Array. */
function base64UrlDecode(input: string): Uint8Array {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Timing-safe byte comparison via XOR accumulation.
 * Returns true only if every byte of `a` equals the corresponding byte of `b`.
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Timing-safe string comparison via HMAC-SHA256.
 *
 * Both strings are signed with the same ephemeral key so the comparison time
 * is independent of where the strings first differ.
 */
async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  // Use a random key per call so the HMAC output is unpredictable to attackers.
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(sigA), new Uint8Array(sigB));
}

/**
 * Verify a plaintext token against a stored PBKDF2-SHA256 hash.
 *
 * Hash format: `pbkdf2_sha256$<iterations>$<salt_b64url>$<digest_b64url>`
 */
async function verifyPbkdf2Token(
  token: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4) return false;
  const [algorithm, iterationsStr, saltB64, digestB64] = parts;
  if (algorithm !== "pbkdf2_sha256") return false;

  const iterations = parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

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
      hash: "SHA-256",
    },
    keyMaterial,
    256 // 32 bytes
  );

  return timingSafeEqualBytes(new Uint8Array(derivedBits), expectedDigest);
}

// ---------------------------------------------------------------------------
// Per-strategy resolvers — all return Actor | null (never throw)
// ---------------------------------------------------------------------------

/**
 * Resolve an agent actor from the X-Agent-Token header.
 *
 * The token is compared against all agents that have a stored PBKDF2 hash.
 * On a successful match the agent's last_seen_at is updated best-effort.
 */
async function resolveAgentActor(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const rawToken = request.headers.get("X-Agent-Token");
  if (!rawToken) return null;
  const token = rawToken.trim();
  if (!token) return null;

  const agentsWithHashes = await db
    .select({
      id: schema.agents.id,
      boardId: schema.agents.boardId,
      agentTokenHash: schema.agents.agentTokenHash,
    })
    .from(schema.agents)
    .where(isNotNull(schema.agents.agentTokenHash));

  for (const agent of agentsWithHashes) {
    if (!agent.agentTokenHash) continue;
    const valid = await verifyPbkdf2Token(token, agent.agentTokenHash);
    if (valid) {
      // Best-effort presence touch — do not await so auth is never delayed.
      const now = new Date().toISOString();
      db.update(schema.agents)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(schema.agents.id, agent.id))
        .run()
        .catch(() => undefined);

      return { type: "agent", agentId: agent.id };
    }
  }

  return null;
}

/**
 * Resolve a user actor via Clerk JWT verification.
 *
 * Requires CLERK_SECRET_KEY env var. Returns null if the key is absent,
 * the token is missing, or JWT verification fails.
 */
async function resolveClerkActor(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const { verifyToken } = await import("@clerk/nextjs/server");
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

    const clerkUserId = payload.sub;
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, clerkUserId))
      .limit(1);

    if (!rows[0]) return null;

    return {
      type: "user",
      userId: rows[0].id,
      clerkId: clerkUserId,
      orgId: rows[0].activeOrganizationId ?? undefined,
    };
  } catch {
    // JWT verification failure, network error, or missing dep — treat as unauth.
    return null;
  }
}

/**
 * Resolve a user actor via local bearer token.
 *
 * Compares the Authorization: Bearer value against `process.env.LOCAL_AUTH_TOKEN`
 * using a timing-safe HMAC comparison so the response time does not leak token
 * prefixes.
 */
async function resolveLocalActor(
  request: Request,
  db: Database
): Promise<Actor | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const expected = process.env.LOCAL_AUTH_TOKEN;
  if (!expected) return null;

  const valid = await timingSafeEqualStrings(token, expected.trim());
  if (!valid) return null;

  // The "local" user is keyed by the sentinel clerk_user_id value 'local'.
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, "local"))
    .limit(1);

  if (!rows[0]) return null;

  return {
    type: "user",
    userId: rows[0].id,
    clerkId: "local",
    orgId: rows[0].activeOrganizationId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the authenticated actor from the request without throwing.
 *
 * Returns `null` if no valid credentials are found.
 */
export async function resolveAuth(
  request: Request,
  db: Database
): Promise<Actor | null> {
  // 1. Agent token has highest priority.
  const agentActor = await resolveAgentActor(request, db);
  if (agentActor) return agentActor;

  // 2. Dispatch to user strategy based on AUTH_MODE.
  const authMode =
    process.env.AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "clerk";

  if (authMode === "local") {
    return resolveLocalActor(request, db);
  }

  return resolveClerkActor(request, db);
}

/**
 * Require an authenticated actor.
 *
 * Throws a `Response` (not an `Error`) with status 401 when authentication
 * fails, allowing callers to return it directly from a Route Handler:
 *
 * ```ts
 * try {
 *   const actor = await authenticate(req, db);
 * } catch (res) {
 *   if (res instanceof Response) return res;
 *   throw res;
 * }
 * ```
 */
export async function authenticate(
  request: Request,
  db: Database
): Promise<Actor> {
  const actor = await resolveAuth(request, db);
  if (!actor) {
    throw unauthorized();
  }
  return actor;
}
