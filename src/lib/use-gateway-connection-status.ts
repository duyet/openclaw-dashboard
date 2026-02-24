import { useCallback, useEffect, useRef, useState } from "react";
import { checkGatewayConnection } from "@/lib/gateway-form";

/**
 * Polls gateway connectivity from the browser via a direct WebSocket check.
 *
 * The gateway may live on an internal network (e.g. Tailscale) that is
 * reachable from the user's browser but NOT from the Cloudflare edge, so the
 * check must be initiated client-side.
 *
 * @param gatewayUrl   - WebSocket URL of the gateway (ws:// or wss://).
 * @param gatewayToken - Bearer token sent as a query parameter.
 * @param options.enabled    - When false the hook does nothing (default: true).
 * @param options.intervalMs - Polling interval in milliseconds (default: 15 000).
 *
 * @returns `isConnected` — null until the first check resolves, then boolean.
 *          `isChecking`  — true while a check is in flight.
 */
export function useGatewayConnectionStatus(
  gatewayUrl: string | null | undefined,
  gatewayToken: string | null | undefined,
  options?: { enabled?: boolean; intervalMs?: number }
): {
  isConnected: boolean | null;
  isChecking: boolean;
} {
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? 15_000;

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Keep a ref so runCheck always reads the latest url/token without needing
  // to be in the dependency array (avoids retriggering the interval effect).
  const paramsRef = useRef({ gatewayUrl, gatewayToken });
  useEffect(() => {
    paramsRef.current = { gatewayUrl, gatewayToken };
  });

  // Reset connection state whenever the target URL changes so stale results
  // are never shown for a different gateway.
  useEffect(() => {
    setIsConnected(null);
  }, [gatewayUrl]);

  const runCheck = useCallback(async () => {
    const { gatewayUrl: url, gatewayToken: token } = paramsRef.current;
    if (!url) return;
    setIsChecking(true);
    const result = await checkGatewayConnection({
      gatewayUrl: url,
      gatewayToken: token ?? "",
    });
    setIsConnected(result.ok);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    if (!enabled || !gatewayUrl) return;

    void runCheck();
    const timer = setInterval(() => {
      void runCheck();
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [enabled, gatewayUrl, intervalMs, runCheck]);

  return { isConnected, isChecking };
}
