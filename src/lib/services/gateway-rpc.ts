/**
 * Gateway RPC client over native WebSocket.
 *
 * Uses the native `WebSocket` API so this module runs in the edge runtime and
 * Cloudflare Workers without the `ws` npm package.
 *
 * Protocol: JSON-RPC 2.0 over WebSocket.
 *   Request:  { jsonrpc: "2.0", id: <uuid>, method, params }
 *   Response: { jsonrpc: "2.0", id: <uuid>, result }
 *          or { jsonrpc: "2.0", id: <uuid>, error: { code, message, data? } }
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when the gateway returns a JSON-RPC error object, the connection
 * cannot be established, or the call times out.
 */
export class GatewayError extends Error {
  /** JSON-RPC error code, or -1 for transport/timeout errors. */
  public readonly code: number;
  /** Optional extra data from the JSON-RPC error object. */
  public readonly data?: unknown;

  constructor(message: string, code = -1, data?: unknown) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

function isErrorResponse(r: JsonRpcResponse): r is JsonRpcErrorResponse {
  return "error" in r && r.error !== null && typeof r.error === "object";
}

// ---------------------------------------------------------------------------
// Core RPC function
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Open a WebSocket connection to `gatewayUrl`, send a single JSON-RPC 2.0
 * request, await the matching response, close the socket, and return the
 * result.
 *
 * @param gatewayUrl  - Full WebSocket URL of the gateway (ws:// or wss://).
 * @param token       - Optional bearer token sent as a query param (`token=…`)
 *                      because the WebSocket API does not support custom headers
 *                      in browser/edge environments.
 * @param method      - JSON-RPC method name.
 * @param params      - JSON-RPC params (any JSON-serialisable value).
 * @param timeoutMs   - Milliseconds before the call is aborted (default 30 s).
 *
 * @throws {GatewayError} on connection failure, timeout, or JSON-RPC error.
 */
export async function callGatewayRpc(
  gatewayUrl: string,
  token: string | null | undefined,
  method: string,
  params: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  // Append auth token as a query parameter if provided.
  // The WebSocket API does not allow custom request headers in edge/browser
  // environments, so token transport via query string is the only portable
  // option here. Gateways must accept `?token=<value>`.
  let wsUrl = gatewayUrl;
  if (token) {
    const separator = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  const id = crypto.randomUUID();
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let ws: WebSocket;

    // Timeout guard — rejects and closes the socket if the call takes too long.
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

    ws.addEventListener("open", () => {
      try {
        ws.send(JSON.stringify(request));
      } catch (err) {
        done(() =>
          reject(
            new GatewayError(
              `Failed to send RPC request: ${err instanceof Error ? err.message : String(err)}`
            )
          )
        );
      }
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      let envelope: JsonRpcResponse;
      try {
        envelope = JSON.parse(
          typeof event.data === "string" ? event.data : ""
        ) as JsonRpcResponse;
      } catch {
        // Not valid JSON — wait for the real response.
        return;
      }

      // Ignore responses that don't match our request ID.
      if (!envelope || envelope.id !== id) return;

      try {
        ws.close(1000, "done");
      } catch {
        // Ignore.
      }

      if (isErrorResponse(envelope)) {
        done(() =>
          reject(
            new GatewayError(
              envelope.error.message,
              envelope.error.code,
              envelope.error.data
            )
          )
        );
      } else {
        done(() => resolve((envelope as JsonRpcSuccessResponse).result));
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
      // If we close before receiving a response it is an error (unless already settled).
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
  /** Bearer token for authentication (sent as query param). */
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

export function getSessions(config: GatewayConfig): Promise<unknown[]> {
  return rpc<unknown[]>(config, "sessions.list", {});
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
