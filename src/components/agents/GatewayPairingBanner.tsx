"use client";

import { useState } from "react";
import {
  requestPairing,
  verifyPairing,
  type GatewayConfig,
} from "@/lib/services/gateway-rpc";
import { Button } from "@/components/ui/button";
import { createLogger } from "@/lib/logger";
import { customFetch } from "@/api/mutator";

const log = createLogger("[GatewayPairingBanner]");

interface GatewayPairingBannerProps {
  gatewayId: string;
  gatewayName: string;
  gatewayConfig: GatewayConfig;
  onApprovalComplete?: () => void;
}

type PairingState = "idle" | "requesting" | "waiting" | "approved" | "rejected";

export function GatewayPairingBanner({
  gatewayId,
  gatewayName,
  gatewayConfig,
  onApprovalComplete,
}: GatewayPairingBannerProps) {
  const [state, setState] = useState<PairingState>("idle");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRequestApproval = async () => {
    log.info("handleRequestApproval:start", { gatewayId, gatewayName });
    setState("requesting");
    setError(null);

    try {
      const response = await requestPairing(gatewayConfig, {
        label: "Mission Control",
        scopes: ["operator.pairing"],
      });

      log.info("requestPairing:success", { requestId: response.request_id, status: response.status });

      setRequestId(response.request_id);
      setState("waiting");

      // Start polling for verification
      const pollInterval = setInterval(async () => {
        try {
          log.info("verifyPairing:polling", { requestId: response.request_id });
          const verifyResponse = await verifyPairing(
            gatewayConfig,
            response.request_id
          );

          log.info("verifyPairing:response", {
            requestId: response.request_id,
            status: verifyResponse.status,
            hasToken: !!verifyResponse.token,
          });

          if (
            verifyResponse.status === "approved" &&
            verifyResponse.token
          ) {
            log.info("pairing:approved", { requestId: response.request_id });
            clearInterval(pollInterval);
            setState("approved");

            // Send device token to backend
            log.info("syncApi:calling", { gatewayId });
            try {
              await customFetch<{ device_token: string }>(
                `/api/v1/gateways/${encodeURIComponent(gatewayId)}/pair/approve`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    device_token: verifyResponse.token,
                  }),
                }
              );
              log.info("syncApi:success", { gatewayId });
            } catch (syncErr) {
              log.error("syncApi:failed", syncErr, { gatewayId });
            }

            onApprovalComplete?.();
          } else if (verifyResponse.status === "rejected") {
            log.info("pairing:rejected", { requestId: response.request_id });
            clearInterval(pollInterval);
            setState("rejected");
            setError("Gateway approval was rejected.");
          }
        } catch (err) {
          // Polling continues even if verification fails temporarily
          log.error("verifyPairing:failed", err, { requestId: response.request_id });
        }
      }, 3000); // Poll every 3 seconds

      // Cleanup on unmount or timeout
      return () => {
        log.info("polling:cleanup", { requestId: response.request_id });
        clearInterval(pollInterval);
      };
    } catch (err) {
      log.error("requestPairing:failed", err, { gatewayId, gatewayName });
      setError(
        err instanceof Error
          ? err.message
          : "Failed to request gateway approval"
      );
      setState("idle");
    }
  };

  const isWaiting = state === "waiting" || state === "requesting";

  return (
    <div className="my-4 rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-lg">⚠️</div>
        <div className="flex-grow">
          <h3 className="font-semibold text-amber-900">
            {gatewayName} needs approval
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            Mission Control needs operator access to "{gatewayName}" to read
            session data.
          </p>

          {error && (
            <p className="mt-2 text-sm text-red-600">
              Error: {error}
            </p>
          )}

          {state === "approved" && (
            <p className="mt-2 text-sm text-emerald-600">
              ✓ Gateway approved! Sessions will sync automatically.
            </p>
          )}

          {state === "rejected" && (
            <p className="mt-2 text-sm text-red-600">
              Gateway approval was rejected. Try again later.
            </p>
          )}

          {state === "idle" && !error && (
            <>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={handleRequestApproval}
                  size="sm"
                  variant="primary"
                >
                  Request Approval
                </Button>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                Click above, then run on your gateway: <code className="rounded bg-white px-1 py-0.5">openclaw pair approve</code>
              </p>
            </>
          )}

          {isWaiting && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                <span className="text-sm text-blue-700">
                  Waiting for gateway approval...
                </span>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                Run this on your gateway: <code className="rounded bg-white px-1 py-0.5">openclaw pair approve</code>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
