"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GatewayRead } from "@/api/generated/model";
import {
  getSessions,
  type GatewaySession,
} from "@/lib/services/gateway-rpc";
import { createLogger } from "@/lib/logger";
import { customFetch } from "@/api/mutator";

const log = createLogger("[useGatewaySessions]");

interface UseGatewaySessionsOptions {
  enabled?: boolean;
}

interface UseGatewaySessionsResult {
  sessionsByGateway: Map<string, GatewaySession[]>;
  gatewayOnline: Map<string, boolean>;
  sessionByKey: Map<string, GatewaySession>;
  scopeErrors: Map<string, boolean>;
  syncStatus: Map<string, "idle" | "syncing" | "synced">;
  isLoading: boolean;
}

export function useGatewaySessions(
  gateways: GatewayRead[],
  options?: UseGatewaySessionsOptions
): UseGatewaySessionsResult {
  // Deduplicate gateways by id
  const uniqueGateways = useMemo(() => {
    const seen = new Set<string>();
    return gateways.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
  }, [gateways]);

  const gatewayIds = useMemo(
    () => Array.isArray(uniqueGateways) ? uniqueGateways.map((g) => g.id) : [],
    [uniqueGateways]
  );

  const query = useQuery({
    queryKey: ["gateway-sessions", gatewayIds.join(",")],
    queryFn: async () => {
      log.info("queryFn:start", { gatewayIds, numGateways: uniqueGateways.length });

      const timeout = 10_000; // 10s timeout per gateway

      const results = await Promise.allSettled(
        (Array.isArray(uniqueGateways) ? uniqueGateways : []).map(async (gateway) => {
          log.info("gatewayFetch:start", { gatewayId: gateway.id, gatewayName: gateway.name });
          try {
            const sessions = await Promise.race([
              getSessions({ url: gateway.url, token: gateway.token ?? null }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Gateway RPC timeout")),
                  timeout
                )
              ),
            ]);

            log.info("gatewayFetch:success", {
              gatewayId: gateway.id,
              numSessions: Array.isArray(sessions) ? sessions.length : 0,
            });

            // Fire-and-forget sync to API after successful session fetch
            if (sessions && Array.isArray(sessions) && sessions.length > 0) {
              log.info("syncApi:calling", { gatewayId: gateway.id, numSessions: sessions.length });
              // Use customFetch to include auth headers (local token or Clerk JWT)
              customFetch<{ data: { synced: number } }>(
                `/api/v1/gateways/${encodeURIComponent(gateway.id)}/sessions/sync`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessions }),
                }
              )
                .then((result) => {
                  log.info("syncApi:success", {
                    gatewayId: gateway.id,
                    synced: result.data?.synced,
                  });
                })
                .catch((syncErr) => {
                  log.error("syncApi:failed", syncErr, { gatewayId: gateway.id });
                });
            }

            return {
              gatewayId: gateway.id,
              sessions,
              online: true,
              scopeError: false,
            };
          } catch (err) {
            // Detect scope errors
            const scopeError =
              err instanceof Error &&
              err.message.includes("missing scope: operator");

            log.error("gatewayFetch:failed", err, {
              gatewayId: gateway.id,
              gatewayName: gateway.name,
              scopeError,
            });

            return {
              gatewayId: gateway.id,
              sessions: [] as GatewaySession[],
              online: false,
              scopeError,
            };
          }
        })
      );

      const fulfilled = results
        .filter(
          (
            r
          ): r is PromiseFulfilledResult<{
            gatewayId: string;
            sessions: GatewaySession[];
            online: boolean;
            scopeError: boolean;
          }> => r.status === "fulfilled"
        )
        .map((r) => r.value);

      log.info("queryFn:complete", {
        total: results.length,
        fulfilled: fulfilled.length,
        rejected: results.length - fulfilled.length,
      });

      return fulfilled;
    },
    enabled: uniqueGateways.length > 0 && (options?.enabled ?? true),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const sessionsByGateway = useMemo(() => {
    const map = new Map<string, GatewaySession[]>();
    for (const entry of query.data ?? []) {
      map.set(entry.gatewayId, entry.sessions);
    }
    return map;
  }, [query.data]);

  const gatewayOnline = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of query.data ?? []) {
      map.set(entry.gatewayId, entry.online);
    }
    return map;
  }, [query.data]);

  const sessionByKey = useMemo(() => {
    const map = new Map<string, GatewaySession>();
    for (const sessions of sessionsByGateway.values()) {
      for (const session of sessions) {
        map.set(session.session_key, session);
      }
    }
    return map;
  }, [sessionsByGateway]);

  const scopeErrors = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of query.data ?? []) {
      map.set(entry.gatewayId, entry.scopeError ?? false);
    }
    return map;
  }, [query.data]);

  const syncStatus = useMemo(() => {
    const map = new Map<string, "idle" | "syncing" | "synced">();
    for (const entry of query.data ?? []) {
      // Synced if online and has sessions
      if (entry.online && entry.sessions.length > 0) {
        map.set(entry.gatewayId, "synced");
      } else {
        map.set(entry.gatewayId, "idle");
      }
    }
    return map;
  }, [query.data]);

  return {
    sessionsByGateway,
    gatewayOnline,
    sessionByKey,
    scopeErrors,
    syncStatus,
    isLoading: query.isLoading,
  };
}
