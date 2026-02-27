"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

// ============================================================================
// ERROR LOGGING UTILITIES
// ============================================================================

const LOG_PREFIX = "[AgentsPage]";

function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const errorDetails = {
    context,
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : { error },
    ...extra,
  };
  console.error(LOG_PREFIX, context, errorDetails);
}

function logInfo(context: string, data?: unknown) {
  console.log(LOG_PREFIX, context, data ?? "");
}

// Global error handler to catch unhandled errors
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    logError("window:error", event.error, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError("window:unhandledRejection", event.reason, {
      promise: String(event.promise),
    });
  });
}
import {
  getListAgentsApiV1AgentsGetQueryKey,
  type listAgentsApiV1AgentsGetResponse,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  getListBoardsApiV1BoardsGetQueryKey,
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import type { AgentRead } from "@/api/generated/model";
import type { ApiError } from "@/api/mutator";
import { useAuth } from "@/auth/clerk";
import { AgentsTable } from "@/components/agents/AgentsTable";
import { GatewayPairingBanner } from "@/components/agents/GatewayPairingBanner";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useGatewaySessions } from "@/lib/hooks/use-gateway-sessions";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";

type EnrichedAgent = AgentRead & {
  _gatewayName?: string;
  _gatewayOnline?: boolean;
  _sessionActive?: boolean;
  _sessionStatus?: string;
  _lastActivity?: string;
  _sessionSyncedAt?: string;
};

const AGENT_SORTABLE_COLUMNS = [
  "name",
  "status",
  "openclaw_session_id",
  "board_id",
  "last_seen_at",
  "updated_at",
];

export default function AgentsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: AGENT_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "agents",
  });

  const [deleteTarget, setDeleteTarget] = useState<AgentRead | null>(null);

  const boardsKey = getListBoardsApiV1BoardsGetQueryKey();
  const agentsKey = getListAgentsApiV1AgentsGetQueryKey();

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 15_000,
      refetchOnMount: "always",
    },
  });

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >({ limit: 200 }, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  const boards = useMemo(
    () => {
      const result = boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [];
      logInfo("boards:useMemo", { count: Array.isArray(result) ? result.length : 0 });
      return result;
    },
    [boardsQuery.data]
  );

  const agents = useMemo(
    () => {
      const result = agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [];
      logInfo("agents:useMemo", { count: Array.isArray(result) ? result.length : 0 });
      return result;
    },
    [agentsQuery.data]
  );

  const gateways = useMemo(
    () => {
      const result = gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [];
      logInfo("gateways:useMemo", { count: Array.isArray(result) ? result.length : 0 });
      return result;
    },
    [gatewaysQuery.data]
  );

  const { sessionByKey, gatewayOnline, scopeErrors, isLoading: sessionsLoading } =
    useGatewaySessions(gateways, { enabled: Boolean(isSignedIn && isAdmin) });

  // Log component lifecycle and query state changes
  useEffect(() => {
    logInfo("component:mounted", {
      isSignedIn,
      isAdmin,
      gatewaysCount: Array.isArray(gateways) ? gateways.length : 0,
      agentsCount: Array.isArray(agents) ? agents.length : 0,
      sessionsLoading,
      scopeErrorsCount: scopeErrors.size,
      gatewayOnlineCount: gatewayOnline.size,
    });
  }, [isSignedIn, isAdmin, gateways, agents, sessionsLoading, scopeErrors, gatewayOnline]);

  const gatewayNameById = useMemo(
    () => new Map(Array.isArray(gateways) ? gateways.map((g) => [g.id, g.name]) : []),
    [gateways]
  );

  const enrichedAgents = useMemo<EnrichedAgent[]>(() => {
    try {
      logInfo("enrichedAgents:start", { agentsCount: Array.isArray(agents) ? agents.length : 0 });
      const result = Array.isArray(agents) ? agents.map((agent) => {
        const gatewayName = gatewayNameById.get(agent.gateway_id);
        const isOnline = gatewayOnline.get(agent.gateway_id);
        const session = agent.openclaw_session_id
          ? sessionByKey.get(agent.openclaw_session_id)
          : undefined;
        return {
          ...agent,
          _gatewayName: gatewayName,
          _gatewayOnline: isOnline,
          _sessionActive: session != null,
          _sessionStatus: session?.status,
          _lastActivity: session?.last_activity_at,
          _sessionSyncedAt: (agent as unknown as Record<string, unknown>)?.session_synced_at as string | undefined,
        };
      }) : [];
      logInfo("enrichedAgents:success", { count: result.length });
      return result;
    } catch (err) {
      logError("enrichedAgents:failed", err, {
        agentsCount: Array.isArray(agents) ? agents.length : 0,
        agentsSample: Array.isArray(agents) ? agents.slice(0, 2) : [],
      });
      return [];
    }
  }, [agents, gatewayNameById, gatewayOnline, sessionByKey]);

  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<
    ApiError,
    { previous?: listAgentsApiV1AgentsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        AgentRead,
        listAgentsApiV1AgentsGetResponse,
        { agentId: string }
      >({
        queryClient,
        queryKey: agentsKey,
        getItemId: (agent) => agent.id,
        getDeleteId: ({ agentId }) => agentId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [agentsKey, boardsKey],
      }),
    },
    queryClient
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ agentId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view agents.",
          forceRedirectUrl: "/agents",
          signUpForceRedirectUrl: "/agents",
        }}
        title="Agents"
        description={`${enrichedAgents.length} agent${enrichedAgents.length === 1 ? "" : "s"} total.`}
        headerActions={
          enrichedAgents.length > 0 ? (
            <Button onClick={() => router.push("/agents/new")}>
              New agent
            </Button>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access agents."
        stickyHeader
      >
        {(() => {
          try {
            logInfo("renderBanners:start", { gatewaysCount: Array.isArray(gateways) ? gateways.length : 0 });
            const result = Array.isArray(gateways) ? gateways.map((gateway) => {
              const hasScopeError = scopeErrors.get(gateway.id);
              if (!hasScopeError) return null;
              return (
                <GatewayPairingBanner
                  key={gateway.id}
                  gatewayId={gateway.id}
                  gatewayName={gateway.name}
                  gatewayConfig={{ url: gateway.url, token: gateway.token ?? null }}
                />
              );
            }) : null;
            logInfo("renderBanners:success", { bannerCount: result ? result.filter(Boolean).length : 0 });
            return result;
          } catch (err) {
            logError("renderBanners:failed", err, {
              gatewaysCount: Array.isArray(gateways) ? gateways.length : 0,
              gatewaysSample: Array.isArray(gateways) ? gateways.slice(0, 2) : [],
            });
            return (
              <div className="my-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-600">
                  Error rendering pairing banners. Check console for details.
                </p>
              </div>
            );
          }
        })()}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <AgentsTable
            agents={enrichedAgents}
            boards={boards}
            isLoading={agentsQuery.isLoading}
            sessionsLoading={sessionsLoading}
            gatewayOnline={gatewayOnline}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            emptyState={{
              title: "No agents yet",
              description:
                "Create your first agent to start executing tasks on this board.",
              actionHref: "/agents/new",
              actionLabel: "Create your first agent",
            }}
          />
        </div>

        {agentsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {agentsQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete agent"
        title="Delete agent"
        description={
          <>
            This will remove {deleteTarget?.name}. This action cannot be undone.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
