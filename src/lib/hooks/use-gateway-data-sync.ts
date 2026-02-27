"use client";

import { useEffect, useRef } from "react";
import type { GatewayRead } from "@/api/generated/model";
import { customFetch } from "@/api/mutator";
import { createLogger } from "@/lib/logger";
import {
  type GatewayCronJob,
  type GatewaySession,
  getSessions,
  getTaskHistory,
} from "@/lib/services/gateway-rpc";

const log = createLogger("[useGatewayDataSync]");

interface UseGatewayDataSyncOptions {
  enabled?: boolean;
  onCronjobsSync?: (cronjobs: GatewayCronJob[]) => void;
  onSessionsSync?: (sessions: GatewaySession[]) => void;
}

interface SyncResult {
  gatewayId: string;
  gatewayName: string;
  sessions: GatewaySession[];
  cronjobs: GatewayCronJob[];
  error?: string;
}

/**
 * Unified hook to fetch and sync gateway data (sessions + cronjobs) to the API.
 *
 * This hook:
 * 1. Fetches sessions from all gateways via WebSocket RPC
 * 2. Fetches cronjobs from all gateways via WebSocket RPC
 * 3. Syncs sessions to /api/v1/gateways/{id}/sessions/sync
 * 4. Calls onCronjobsSync/onSessionsSync callbacks with the data
 *
 * Usage:
 * ```tsx
 * const { syncResults, isSyncing } = useGatewayDataSync(gateways, {
 *   enabled: isSignedIn,
 *   onCronjobsSync: (cronjobs) => setCronjobs(cronjobs),
 *   onSessionsSync: (sessions) => setSessions(sessions),
 * });
 * ```
 */
export function useGatewayDataSync(
  gateways: GatewayRead[],
  options?: UseGatewayDataSyncOptions
) {
  const { enabled = true, onCronjobsSync, onSessionsSync } = options ?? {};
  const syncResultsRef = useRef<Map<string, SyncResult>>(new Map());
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (gateways.length === 0) return;

    const syncGatewayData = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      log.info("sync:start", { numGateways: gateways.length });

      const timeout = 15_000;
      const results: SyncResult[] = [];

      for (const gateway of gateways) {
        const result: SyncResult = {
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          sessions: [],
          cronjobs: [],
        };

        try {
          console.log("[GatewayDataSync] Fetching from gateway:", gateway.name);

          // Fetch sessions
          const sessions = await Promise.race([
            getSessions({ url: gateway.url, token: gateway.token ?? null }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Gateway RPC timeout")), timeout)
            ),
          ]);

          result.sessions = sessions;
          console.log("[GatewayDataSync] Gateway", gateway.name, "sessions:", sessions.length);

          // Sync sessions to API
          if (sessions.length > 0) {
            await customFetch<{ data: { synced: number } }>(
              `/api/v1/gateways/${encodeURIComponent(gateway.id)}/sessions/sync`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessions }),
              }
            );
            console.log("[GatewayDataSync] Synced sessions for:", gateway.name);
          }

          // Fetch cronjobs
          const cronjobs = await Promise.race([
            getTaskHistory({ url: gateway.url, token: gateway.token ?? null }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Gateway RPC timeout")), timeout)
            ),
          ]);

          result.cronjobs = cronjobs;
          console.log("[GatewayDataSync] Gateway", gateway.name, "cronjobs:", cronjobs.length);

        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          result.error = errorMessage;
          console.error("[GatewayDataSync] Failed for gateway:", gateway.name, err);
        }

        results.push(result);
        syncResultsRef.current.set(gateway.id, result);
      }

      // Call callbacks with aggregated data
      const allSessions = results.flatMap((r) => r.sessions);
      const allCronjobs = results.flatMap((r) => r.cronjobs);

      if (allSessions.length > 0) {
        onSessionsSync?.(allSessions);
      }
      if (allCronjobs.length > 0) {
        onCronjobsSync?.(allCronjobs);
      }

      log.info("sync:complete", {
        totalGateways: gateways.length,
        totalSessions: allSessions.length,
        totalCronjobs: allCronjobs.length,
        errors: results.filter((r) => r.error).length,
      });

      isSyncingRef.current = false;
    };

    // Initial sync
    void syncGatewayData();

    // Sync every 30 seconds
    const interval = setInterval(syncGatewayData, 30_000);
    return () => clearInterval(interval);
  }, [enabled, gateways, onCronjobsSync, onSessionsSync]);

  const syncResults = Array.from(syncResultsRef.current.values());
  const isSyncing = isSyncingRef.current;

  return {
    syncResults,
    isSyncing,
    sessions: syncResults.flatMap((r) => r.sessions),
    cronjobs: syncResults.flatMap((r) => r.cronjobs),
  };
}
