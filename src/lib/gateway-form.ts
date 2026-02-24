export const DEFAULT_WORKSPACE_ROOT = "~/.openclaw";

export type GatewayCheckStatus = "idle" | "checking" | "success" | "error";

export const validateGatewayUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "Gateway URL is required.";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return "Gateway URL must start with ws:// or wss://.";
    }
    return null;
  } catch {
    return "Enter a valid gateway URL (e.g. wss://host or wss://host:port).";
  }
};

/**
 * Check gateway connectivity via a direct browser WebSocket connection.
 *
 * The gateway may live on an internal network (e.g. Tailscale) that is
 * reachable from the user's browser but NOT from the Cloudflare edge worker.
 * So we open a WebSocket directly from the browser and wait for the gateway
 * to respond.
 *
 * The gateway protocol sends a `connect.challenge` event after a successful
 * connection + auth. Receiving this event is sufficient proof that the
 * gateway is reachable and the token is valid (an invalid token results in
 * an immediate close with code 1008).
 */
export async function checkGatewayConnection(params: {
  gatewayUrl: string;
  gatewayToken: string;
}): Promise<{ ok: boolean; message: string }> {
  const TIMEOUT_MS = 10_000;
  const gatewayUrl = params.gatewayUrl.trim();
  const gatewayToken = params.gatewayToken.trim();

  if (!gatewayUrl) {
    return { ok: false, message: "Gateway URL is required." };
  }

  // Normalise to WebSocket URL
  let wsUrl = gatewayUrl;
  if (wsUrl.startsWith("https://")) {
    wsUrl = wsUrl.replace("https://", "wss://");
  } else if (wsUrl.startsWith("http://")) {
    wsUrl = wsUrl.replace("http://", "ws://");
  }

  // Append token as query param (WebSocket API doesn't support custom headers)
  if (gatewayToken) {
    const separator = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(gatewayToken)}`;
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close(1000, "timeout");
      } catch {
        // ignore
      }
      resolve({ ok: false, message: "Connection timed out." });
    }, TIMEOUT_MS);

    const done = (result: { ok: boolean; message: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      clearTimeout(timer);
      resolve({
        ok: false,
        message:
          err instanceof Error ? err.message : "Failed to create WebSocket.",
      });
      return;
    }

    ws.addEventListener("message", (event: MessageEvent) => {
      try {
        const data = JSON.parse(
          typeof event.data === "string" ? event.data : ""
        );

        // The gateway sends a connect.challenge event after successful
        // auth. This proves reachability + valid token.
        if (data?.type === "event" && data?.event === "connect.challenge") {
          try {
            ws.close(1000, "done");
          } catch {
            // ignore
          }
          done({ ok: true, message: "Gateway reachable." });
          return;
        }

        // Also accept a direct JSON-RPC response (older gateways that
        // skip the challenge handshake).
        if (data?.jsonrpc === "2.0") {
          try {
            ws.close(1000, "done");
          } catch {
            // ignore
          }
          if (data.error) {
            done({
              ok: false,
              message: data.error.message ?? "Gateway returned an error.",
            });
          } else {
            done({ ok: true, message: "Gateway reachable." });
          }
        }
      } catch {
        // Not valid JSON — wait for the real response
      }
    });

    ws.addEventListener("error", () => {
      done({ ok: false, message: "Unable to reach gateway." });
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      done({
        ok: false,
        message: `Connection closed (code=${event.code}).`,
      });
    });
  });
}
