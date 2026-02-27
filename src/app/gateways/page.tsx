"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getListGatewaysApiV1GatewaysGetQueryKey,
  type listGatewaysApiV1GatewaysGetResponse,
  useDeleteGatewayApiV1GatewaysGatewayIdDelete,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import type { GatewayRead } from "@/api/generated/model";
import type { ApiError } from "@/api/mutator";
import { customFetch } from "@/api/mutator";
import { useAuth } from "@/auth/clerk";
import { GatewaysTable } from "@/components/gateways/GatewaysTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import {
  requestPairing,
  verifyPairing,
  type GatewayConfig,
} from "@/lib/services/gateway-rpc";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";

const GATEWAY_SORTABLE_COLUMNS = ["name", "workspace_root", "updated_at"];

export default function GatewaysPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: GATEWAY_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "gateways",
  });

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [deleteTarget, setDeleteTarget] = useState<GatewayRead | null>(null);
  const [pairingGatewayId, setPairingGatewayId] = useState<string | null>(null);

  const gatewaysKey = getListGatewaysApiV1GatewaysGetQueryKey();
  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [],
    [gatewaysQuery.data]
  );

  const deleteMutation = useDeleteGatewayApiV1GatewaysGatewayIdDelete<
    ApiError,
    { previous?: listGatewaysApiV1GatewaysGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        GatewayRead,
        listGatewaysApiV1GatewaysGetResponse,
        { gatewayId: string }
      >({
        queryClient,
        queryKey: gatewaysKey,
        getItemId: (gateway) => gateway.id,
        getDeleteId: ({ gatewayId }) => gatewayId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [gatewaysKey],
      }),
    },
    queryClient
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ gatewayId: deleteTarget.id });
  };

  const handleRequestApproval = async (gateway: GatewayRead) => {
    const config: GatewayConfig = {
      url: gateway.url,
      token: gateway.token ?? null,
    };

    setPairingGatewayId(gateway.id);

    try {
      const response = await requestPairing(config, {
        nodeId: "mission-control",
      });

      // Poll for approval
      const pollInterval = setInterval(async () => {
        try {
          const verifyResponse = await verifyPairing(config, response.request_id);

          if (verifyResponse.status === "approved" && verifyResponse.token) {
            clearInterval(pollInterval);
            setPairingGatewayId(null);

            // Send device token to backend
            await customFetch<{ device_token: string }>(
              `/api/v1/gateways/${encodeURIComponent(gateway.id)}/pair/approve`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  device_token: verifyResponse.token,
                }),
              }
            );

            // Refresh the gateways list
            queryClient.invalidateQueries({ queryKey: gatewaysKey });
          } else if (verifyResponse.status === "rejected") {
            clearInterval(pollInterval);
            setPairingGatewayId(null);
          }
        } catch {
          // Continue polling on error
        }
      }, 3000);
    } catch (err) {
      setPairingGatewayId(null);
      console.error("Pairing request failed:", err);
    }
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view gateways.",
          forceRedirectUrl: "/gateways",
        }}
        title="Gateways"
        description="Manage OpenClaw gateway connections used by boards"
        headerActions={
          isAdmin && gateways.length > 0 ? (
            <Link
              href="/gateways/new"
              className={buttonVariants({
                size: "md",
                variant: "primary",
              })}
            >
              Create gateway
            </Link>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access gateways."
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <GatewaysTable
            gateways={gateways}
            isLoading={gatewaysQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            onRequestApproval={handleRequestApproval}
            pairingGatewayId={pairingGatewayId}
            emptyState={{
              title: "No gateways yet",
              description:
                "Create your first gateway to connect boards and start managing your OpenClaw connections.",
              actionHref: "/gateways/new",
              actionLabel: "Create your first gateway",
            }}
          />
        </div>

        {gatewaysQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {gatewaysQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete gateway?"
        description={
          <>
            This removes the gateway connection from Mission Control. Boards
            using it will need a new gateway assigned.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        errorStyle="text"
        cancelVariant="ghost"
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
