"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PairingState } from "@/lib/hooks/use-gateway-pairing";
import { useGatewayPairing } from "@/lib/hooks/use-gateway-pairing";
import type { GatewayConfig } from "@/lib/services/gateway-rpc";

interface GatewayPairingBannerProps {
  gatewayId: string;
  gatewayName: string;
  gatewayConfig: GatewayConfig;
  onApprovalComplete?: () => void;
}

export function GatewayPairingBanner({
  gatewayId,
  gatewayName,
  gatewayConfig,
  onApprovalComplete,
}: GatewayPairingBannerProps) {
  const [state, setState] = useState<PairingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const { pairGateway } = useGatewayPairing({
    onApproved: async () => {
      setState("approved");
      onApprovalComplete?.();
    },
    onRejected: async () => {
      setState("rejected");
      setError("Gateway approval was rejected or timed out.");
    },
  });

  const handleRequestApproval = async () => {
    setState("requesting");
    setError(null);

    try {
      setState("waiting");
      await pairGateway(gatewayId, gatewayConfig);
    } catch (err) {
      setState("idle");
      setError(
        err instanceof Error
          ? err.message
          : "Failed to request gateway approval"
      );
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

          {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}

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
                Click above, then run on your gateway:{" "}
                <code className="rounded bg-white px-1 py-0.5">
                  openclaw pair approve
                </code>
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
                Run this on your gateway:{" "}
                <code className="rounded bg-white px-1 py-0.5">
                  openclaw pair approve
                </code>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
