/**
 * Agent token authentication for edge runtime.
 *
 * Agents authenticate via `X-Agent-Token: <token>` header.
 * The token is verified against PBKDF2-SHA256 hashes stored in the agents table.
 *
 * This is a port of backend/app/core/agent_auth.py and backend/app/core/agent_tokens.py.
 *
 * NOTE: PBKDF2 is available on edge via crypto.subtle.deriveBits with the
 * "PBKDF2" algorithm. No bcrypt needed.
 */
import type { ActorContext } from './index';
import type { Actor } from './types';
import { getDb } from '../db';
import type { Database } from '../db';
import { agents } from '../db/schema';
import { isNotNull, eq } from 'drizzle-orm';

const ITERATIONS = 200_000;
const HASH_ALGORITHM = 'SHA-256';
const KEY_LENGTH_BYTES = 32;

/**
 * Decode URL-safe base64 (no padding) to Uint8Array.
 */
function base64UrlDecode(input: string): Uint8Array {
  // Add padding
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  // Convert URL-safe to standard base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a plaintext agent token against a stored PBKDF2 hash.
 *
 * Hash format: `pbkdf2_sha256$<iterations>$<salt_b64>$<digest_b64>`
 * where salt and digest are URL-safe base64 without padding.
 */
async function verifyAgentTokenInternal(token: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;

  const [algorithm, iterationsStr, saltB64, digestB64] = parts;
  if (algorithm !== 'pbkdf2_sha256') return false;

  const iterations = parseInt(iterationsStr, 10);
  if (isNaN(iterations) || iterations <= 0) return false;

  const salt = base64UrlDecode(saltB64);
  const expectedDigest = base64UrlDecode(digestB64);

  // Import the token as a key for PBKDF2
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  // Derive the hash
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );

  const candidateDigest = new Uint8Array(derivedBits);

  // Timing-safe comparison
  if (candidateDigest.length !== expectedDigest.length) return false;
  let result = 0;
  for (let i = 0; i < candidateDigest.length; i++) {
    result |= candidateDigest[i] ^ expectedDigest[i];
  }
  return result === 0;
}

/**
 * Resolve agent auth context from X-Agent-Token header.
 *
 * Looks up all agents with a stored token hash and verifies the
 * provided token against each (same approach as the Python backend).
 */
export async function resolveAgentAuth(
  request: Request,
  d1: D1Database,
): Promise<ActorContext | null> {
  // Check X-Agent-Token header first, then fall back to Authorization: Bearer
  let token = request.headers.get('X-Agent-Token');

  if (!token) {
    // Only accept Authorization: Bearer as agent token if X-Agent-Token was provided
    // (i.e., don't intercept user auth tokens). This mirrors the Python backend's
    // `accept_authorization=False` in `get_agent_auth_context_optional`.
    return null;
  }

  token = token.trim();
  if (!token) return null;

  const db = getDb(d1);

  // Fetch all agents with a token hash
  const agentsWithTokens = await db
    .select({
      id: agents.id,
      boardId: agents.boardId,
      agentTokenHash: agents.agentTokenHash,
    })
    .from(agents)
    .where(isNotNull(agents.agentTokenHash));

  // Verify against each agent's hash
  for (const agent of agentsWithTokens) {
    if (!agent.agentTokenHash) continue;
    const valid = await verifyAgentTokenInternal(token, agent.agentTokenHash);
    if (valid) {
      // Touch last_seen_at (best-effort, non-blocking)
      const now = new Date().toISOString();
      db.update(agents)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(agents.id, agent.id))
        .run()
        .catch(() => {
          // Best-effort: don't fail auth if touch fails
        });

      return {
        type: 'agent',
        agentId: agent.id,
      };
    }
  }

  return null;
}

/**
 * Generate a new URL-safe random token for an agent.
 */
export function generateAgentToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // URL-safe base64 without padding
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Hash an agent token using PBKDF2-HMAC-SHA256.
 * Returns format: `pbkdf2_sha256$<iterations>$<salt_b64>$<digest_b64>`
 */
export async function hashAgentToken(token: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );

  const digest = new Uint8Array(derivedBits);

  // URL-safe base64 encode without padding
  const saltB64 = btoa(String.fromCharCode(...salt))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const digestB64 = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `pbkdf2_sha256$${ITERATIONS}$${saltB64}$${digestB64}`;
}

/**
 * Spec-compatible export: verify an agent token and return Actor | null.
 * Uses a Drizzle Database instance rather than raw D1Database.
 *
 * The backend stores PBKDF2-SHA256 hashes (not bcrypt) — verified above.
 */
export async function verifyAgentToken(
  token: string,
  db: Database,
): Promise<Actor | null> {
  if (!token || token.length < 20) return null;

  const agentsWithTokens = await db
    .select({
      id: agents.id,
      boardId: agents.boardId,
      agentTokenHash: agents.agentTokenHash,
    })
    .from(agents)
    .where(isNotNull(agents.agentTokenHash));

  for (const agent of agentsWithTokens) {
    if (!agent.agentTokenHash) continue;
    const valid = await verifyAgentTokenHash(token, agent.agentTokenHash);
    if (valid) {
      const now = new Date().toISOString();
      db.update(agents)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(agents.id, agent.id))
        .run()
        .catch(() => undefined);
      return { type: 'agent', agentId: agent.id };
    }
  }
  return null;
}

/**
 * Internal: verify a plaintext token against a stored PBKDF2 hash.
 * Extracted from verifyAgentToken for reuse within the module.
 */
async function verifyAgentTokenHash(token: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const [algorithm, iterationsStr, saltB64, digestB64] = parts;
  if (algorithm !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(iterationsStr, 10);
  if (isNaN(iterations) || iterations <= 0) return false;

  const salt = base64UrlDecode(saltB64);
  const expectedDigest = base64UrlDecode(digestB64);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: HASH_ALGORITHM },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  const candidate = new Uint8Array(derivedBits);
  if (candidate.length !== expectedDigest.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expectedDigest[i];
  return diff === 0;
}
