/**
 * Gateway RPC client over native WebSocket.
 *
 * Uses the native `WebSocket` API so this module runs in the edge runtime and
 * Cloudflare Workers without the `ws` npm package.
 *
 * Protocol: OpenClaw gateway protocol over WebSocket.
 *   Request:  { type: "req", id: "<uuid>", method, params }
 *   Response: { type: "res", id: "<uuid>", ok: true|false, payload, error? }
 *   Event:    { type: "event", event: "<name>", payload, seq? }
 *
 * Connection handshake (required before any RPC call):
 *   1. Open WebSocket with ?token=<token> query param.
 *   2. Wait for { type: "event", event: "connect.challenge", payload: { nonce, ts } }
 *   3. Send connect request with client metadata and auth token.
 *   4. Wait for hello-ok response: { type: "res", ok: true, payload: { type: "hello-ok" } }
 *   5. Send actual RPC method.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when the gateway returns an error response, the connection cannot be
 * established, the handshake fails, or the call times out.
 */
export class GatewayError extends Error {
  /**
   * Numeric error code. -1 for transport/timeout errors. For gateway protocol
   * errors the string code (e.g. "INVALID_REQUEST") is stored in `data` and
   * this field is set to -1 for backward compatibility.
   */
  public readonly code: number;
  /** Extra detail from the gateway error object (may include the string code). */
  public readonly data?: unknown;

  constructor(message: string, code = -1, data?: unknown) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Internal protocol types
// ---------------------------------------------------------------------------

interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params: unknown;
}

interface GatewayResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
  };
}

interface GatewayEvent {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent;

function isGatewayResponse(f: GatewayFrame): f is GatewayResponse {
  return f.type === "res";
}

function isGatewayEvent(f: GatewayFrame): f is GatewayEvent {
  return f.type === "event";
}

// ---------------------------------------------------------------------------
// Core RPC function
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

/** Client metadata sent in every connect request. */
const CLIENT_META = {
  id: "cli",
  version: "1.0.0",
  platform: "cloudflare-worker",
  mode: "backend",
} as const;

/**
 * Open a WebSocket connection to `gatewayUrl`, perform the OpenClaw connect
 * handshake, send a single RPC request, await the matching response, close
 * the socket, and return the payload.
 *
 * @param gatewayUrl  - Full WebSocket URL of the gateway (ws:// or wss://).
 * @param token       - Auth token. Sent as both `?token=…` query param (for
 *                      initial acceptance) and in the connect request auth
 *                      field.
 * @param method      - RPC method name (e.g. "sessions.list").
 * @param params      - Method params (any JSON-serialisable value).
 * @param timeoutMs   - Milliseconds before the call is aborted (default 30 s).
 *
 * @throws {GatewayError} on connection failure, handshake failure, timeout,
 *                        or RPC error.
 */
export async function callGatewayRpc(
  gatewayUrl: string,
  token: string | null | undefined,
  method: string,
  params: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  // Append auth token as a query parameter — the WebSocket API does not allow
  // custom request headers in edge/browser environments.
  let wsUrl = gatewayUrl;
  if (token) {
    const separator = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let ws: WebSocket;

    // Tracks the connection phase so the message handler knows what to expect.
    // "awaiting-challenge" → waiting for connect.challenge event
    // "awaiting-hello"     → connect req sent, waiting for hello-ok
    // "awaiting-response"  → actual RPC sent, waiting for its response
    type Phase = "awaiting-challenge" | "awaiting-hello" | "awaiting-response";
    let phase: Phase = "awaiting-challenge";

    const connectId = crypto.randomUUID();
    const rpcId = crypto.randomUUID();

    // Timeout guard.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close(1000, "timeout");
      } catch {
        // Ignore close errors during cleanup.
      }
      reject(new GatewayError(`Gateway RPC timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const sendJson = (value: unknown): boolean => {
      try {
        ws.send(JSON.stringify(value));
        return true;
      } catch (err) {
        done(() =>
          reject(
            new GatewayError(
              `Failed to send frame: ${err instanceof Error ? err.message : String(err)}`
            )
          )
        );
        return false;
      }
    };

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      clearTimeout(timer);
      reject(
        new GatewayError(
          `Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`
        )
      );
      return;
    }

    ws.addEventListener("message", (event: MessageEvent) => {
      if (settled) return;

      let frame: GatewayFrame;
      try {
        frame = JSON.parse(
          typeof event.data === "string" ? event.data : ""
        ) as GatewayFrame;
      } catch {
        // Not valid JSON — ignore.
        return;
      }

      if (!frame || typeof frame.type !== "string") return;

      // ---- Phase: waiting for connect.challenge ----
      if (phase === "awaiting-challenge") {
        if (!isGatewayEvent(frame)) return;
        // Ignore non-challenge events (there shouldn't be any, but be defensive).
        if (frame.event !== "connect.challenge") return;

        // Send the connect request.
        const connectReq: GatewayRequest = {
          type: "req",
          id: connectId,
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: CLIENT_META,
            role: "operator",
            scopes: [],
            caps: [],
            auth: { token: token ?? "" },
          },
        };

        phase = "awaiting-hello";
        sendJson(connectReq);
        return;
      }

      // ---- Phase: waiting for hello-ok ----
      if (phase === "awaiting-hello") {
        if (!isGatewayResponse(frame)) return;
        if (frame.id !== connectId) return;

        if (!frame.ok) {
          const errMsg =
            frame.error?.message ?? "Handshake failed: no error message";
          done(() => reject(new GatewayError(errMsg, -1, frame.error?.code)));
          return;
        }

        // Verify hello-ok payload type.
        const helloPayload = frame.payload as { type?: string } | null;
        if (!helloPayload || helloPayload.type !== "hello-ok") {
          done(() =>
            reject(
              new GatewayError(
                `Unexpected handshake payload type: ${helloPayload?.type ?? "(none)"}`
              )
            )
          );
          return;
        }

        // Handshake complete — send the actual RPC request.
        const rpcReq: GatewayRequest = {
          type: "req",
          id: rpcId,
          method,
          params,
        };

        phase = "awaiting-response";
        sendJson(rpcReq);
        return;
      }

      // ---- Phase: waiting for RPC response ----
      if (phase === "awaiting-response") {
        // Silently drop events (e.g. tick) while waiting.
        if (!isGatewayResponse(frame)) return;
        // Ignore responses that don't match our request ID.
        if (frame.id !== rpcId) return;

        try {
          ws.close(1000, "done");
        } catch {
          // Ignore.
        }

        if (!frame.ok) {
          const errMsg =
            frame.error?.message ?? "Gateway returned an error response";
          done(() => reject(new GatewayError(errMsg, -1, frame.error?.code)));
        } else {
          done(() => resolve(frame.payload));
        }
      }
    });

    ws.addEventListener("error", (event: Event) => {
      const detail =
        event instanceof ErrorEvent ? event.message : "WebSocket error";
      done(() =>
        reject(new GatewayError(`Gateway connection error: ${detail}`))
      );
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      // If the socket closes before we are settled it is an error.
      done(() =>
        reject(
          new GatewayError(
            `Gateway WebSocket closed before response (code=${event.code})`
          )
        )
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Gateway configuration
// ---------------------------------------------------------------------------

/** Connection parameters for a gateway instance. */
export interface GatewayConfig {
  /** WebSocket URL of the gateway (ws:// or wss://). */
  url: string;
  /** Bearer token for authentication (sent as query param and in connect auth). */
  token: string | null;
}

// ---------------------------------------------------------------------------
// Typed RPC method helpers
// ---------------------------------------------------------------------------

/**
 * Helper that wraps `callGatewayRpc` for a typed method name and result.
 */
function rpc<T>(
  config: GatewayConfig,
  method: string,
  params: unknown,
  timeoutMs?: number
): Promise<T> {
  return callGatewayRpc(
    config.url,
    config.token,
    method,
    params,
    timeoutMs
  ) as Promise<T>;
}

// -- Session management --

export function getSessions(config: GatewayConfig): Promise<GatewaySession[]> {
  return rpc<GatewaySession[]>(config, "sessions.list", {});
}

export function getSession(
  config: GatewayConfig,
  sessionKey: string
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.get", { session_key: sessionKey });
}

export function createSession(
  config: GatewayConfig,
  params: {
    session_key: string;
    agent_name: string;
    workspace_root?: string;
    identity_template?: string;
    soul_template?: string;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.create", params);
}

export function deleteSession(
  config: GatewayConfig,
  sessionKey: string
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.delete", { session_key: sessionKey });
}

export function resetSession(
  config: GatewayConfig,
  sessionKey: string
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.reset", { session_key: sessionKey });
}

export function bootstrapSession(
  config: GatewayConfig,
  sessionKey: string,
  params?: { force?: boolean }
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.bootstrap", {
    session_key: sessionKey,
    ...params,
  });
}

export function updateSessionTemplates(
  config: GatewayConfig,
  params: {
    session_key: string;
    identity_template?: string;
    soul_template?: string;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.update_templates", params);
}

// -- Messaging --

export function sendMessage(
  config: GatewayConfig,
  params: {
    session_key: string;
    agent_name: string;
    message: string;
    deliver?: boolean;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "messages.send", params);
}

// -- Runtime info --

export function getRuntimeInfo(config: GatewayConfig): Promise<unknown> {
  return rpc<unknown>(config, "runtime.info", {});
}

// -- Command execution --

export function executeCommand(
  config: GatewayConfig,
  params: {
    session_key: string;
    command: string;
    args?: string[];
    cwd?: string;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "commands.execute", params);
}

// -- Token management --

export function rotateToken(
  config: GatewayConfig,
  sessionKey: string
): Promise<unknown> {
  return rpc<unknown>(config, "sessions.rotate_token", {
    session_key: sessionKey,
  });
}

// -- Skill management --

export function installSkill(
  config: GatewayConfig,
  params: {
    source_url: string;
    name?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "skills.install", params);
}

export function uninstallSkill(
  config: GatewayConfig,
  params: { source_url: string }
): Promise<unknown> {
  return rpc<unknown>(config, "skills.uninstall", params);
}

export function listSkills(config: GatewayConfig): Promise<unknown[]> {
  return rpc<unknown[]>(config, "skills.list", {});
}

export function syncSkillPack(
  config: GatewayConfig,
  params: {
    source_url: string;
    branch?: string;
    name?: string;
  }
): Promise<unknown> {
  return rpc<unknown>(config, "skills.sync_pack", params);
}

// -- Task/Execution history --

export interface GatewayTask {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at?: string;
  agent_name?: string;
  agent_id?: string;
  session_key?: string;
  due_at?: string;
  error?: string;
  result?: unknown;
}

export interface GatewaySession {
  session_key: string;
  agent_name?: string;
  status?: string; // "active" | "idle" | "bootstrapping"
  workspace_root?: string;
  created_at?: string;
  last_activity_at?: string;
}

/**
 * Fetch task/execution history from the gateway.
 * Returns tasks that agents have executed, including cronjob runs.
 */
export function getTaskHistory(
  config: GatewayConfig,
  params?: {
    limit?: number;
    offset?: number;
    agent_id?: string;
    session_key?: string;
    since?: string; // ISO timestamp
  }
): Promise<GatewayTask[]> {
  return rpc<GatewayTask[]>(config, "tasks.list", params ?? {});
}

// -- Node pairing --

export function requestPairing(
  config: GatewayConfig,
  params: { label: string; scopes: string[] }
): Promise<{ request_id: string; status: string }> {
  return rpc<{ request_id: string; status: string }>(
    config,
    "node.pair.request",
    params
  );
}

export function verifyPairing(
  config: GatewayConfig,
  requestId: string
): Promise<{ status: "pending" | "approved" | "rejected"; token?: string }> {
  return rpc<{ status: "pending" | "approved" | "rejected"; token?: string }>(
    config,
    "node.pair.verify",
    { request_id: requestId }
  );
}
