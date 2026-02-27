"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GatewayRead } from "@/api/generated/model";
import {
  getSessions,
  type GatewaySession,
} from "@/lib/services/gateway-rpc";

interface UseGatewaySessionsOptions {
  enabled?: boolean;
}

interface UseGatewaySessionsResult {
  sessionsByGateway: Map<string, GatewaySession[]>;
  gatewayOnline: Map<string, boolean>;
  sessionByKey: Map<string, GatewaySession>;
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
    () => uniqueGateways.map((g) => g.id),
    [uniqueGateways]
  );

  const query = useQuery({
    queryKey: ["gateway-sessions", gatewayIds.join(",")],
    queryFn: async () => {
      const timeout = 10_000; // 10s timeout per gateway

      const results = await Promise.allSettled(
        uniqueGateways.map(async (gateway) => {
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
            return { gatewayId: gateway.id, sessions, online: true };
          } catch {
            // Gateway offline or error — return empty result
            return {
              gatewayId: gateway.id,
              sessions: [] as GatewaySession[],
              online: false,
            };
          }
        })
      );

      return results
        .filter(
          (
            r
          ): r is PromiseFulfilledResult<{
            gatewayId: string;
            sessions: GatewaySession[];
            online: boolean;
          }> => r.status === "fulfilled"
        )
        .map((r) => r.value);
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

  return {
    sessionsByGateway,
    gatewayOnline,
    sessionByKey,
    isLoading: query.isLoading,
  };
}
