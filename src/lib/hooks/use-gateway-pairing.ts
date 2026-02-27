"use client";

import { useCallback } from "react";
import { customFetch } from "@/api/mutator";
import { createLogger } from "@/lib/logger";
import {
  type GatewayConfig,
  listPairing,
  requestPairing,
} from "@/lib/services/gateway-rpc";

const log = createLogger("[useGatewayPairing]");

const PAIRING_NODE_ID = "OpenClaw Mission Control";
const POLL_INTERVAL_MS = 3000;

type PairingState = "idle" | "requesting" | "waiting" | "approved" | "rejected";

interface UseGatewayPairingOptions {
  onApproved?: () => void | Promise<void>;
  onRejected?: () => void | Promise<void>;
}

interface UseGatewayPairingResult {
  pairGateway: (
    gatewayId: string,
    config: GatewayConfig
  ) => Promise<() => void>;
}

export function useGatewayPairing(
  options: UseGatewayPairingOptions = {}
): UseGatewayPairingResult {
  const { onApproved, onRejected } = options;

  const pairGateway = useCallback(
    async (gatewayId: string, config: GatewayConfig) => {
      log.info("pairGateway:start", { gatewayId });

      const response = await requestPairing(config, { nodeId: PAIRING_NODE_ID });
      log.info("requestPairing:success", {
        requestId: response.request_id,
        status: response.status,
      });

      const pollInterval = setInterval(async () => {
        try {
          const listResponse = await listPairing(config);

          const pairedNode = listResponse.paired.find(
            (n) => n.nodeId === PAIRING_NODE_ID
          );

          if (pairedNode) {
            log.info("pairing:approved", {
              requestId: response.request_id,
              nodeId: pairedNode.nodeId,
              hasToken: !!pairedNode.token,
            });
            clearInterval(pollInterval);

            await customFetch<{ device_token: string }>(
              `/api/v1/gateways/${encodeURIComponent(gatewayId)}/pair/approve`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_token: pairedNode.token }),
              }
            );
            log.info("syncApi:success", { gatewayId });

            await onApproved?.();
            return;
          }

          const isStillPending = listResponse.pending.some(
            (p) => p.requestId === response.request_id
          );

          if (!isStillPending && !pairedNode) {
            log.info("pairing:rejected", { requestId: response.request_id });
            clearInterval(pollInterval);
            await onRejected?.();
          }
        } catch (err) {
          log.error("listPairing:failed", err, {
            requestId: response.request_id,
          });
        }
      }, POLL_INTERVAL_MS);

      return () => {
        log.info("polling:cleanup", { requestId: response.request_id });
        clearInterval(pollInterval);
      };
    },
    [onApproved, onRejected]
  );

  return { pairGateway };
}

export type { PairingState };
