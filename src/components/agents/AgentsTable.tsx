import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";

import type { AgentRead, BoardRead } from "@/api/generated/model";
import {
  dateCell,
  linkifyCell,
  pillCell,
} from "@/components/tables/cell-formatters";
import { DataTable } from "@/components/tables/DataTable";
import { truncateText as truncate } from "@/lib/formatters";

type AgentsTableEmptyState = {
  title: string;
  description: string;
  icon?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
};

type AgentWithGateway = AgentRead & {
  _gatewayName?: string;
  _gatewayOnline?: boolean;
  _sessionActive?: boolean;
  _sessionStatus?: string;
  _lastActivity?: string;
};

type AgentsTableProps = {
  agents: AgentWithGateway[];
  boards?: BoardRead[];
  isLoading?: boolean;
  sessionsLoading?: boolean;
  gatewayOnline?: Map<string, boolean>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  showActions?: boolean;
  hiddenColumns?: string[];
  columnOrder?: string[];
  disableSorting?: boolean;
  stickyHeader?: boolean;
  emptyMessage?: string;
  emptyState?: AgentsTableEmptyState;
  onDelete?: (agent: AgentRead) => void;
};

const SESSION_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  idle: "bg-amber-100 text-amber-700",
  bootstrapping: "bg-blue-100 text-blue-700",
};

const DEFAULT_EMPTY_ICON = (
  <svg
    className="h-16 w-16 text-slate-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export function AgentsTable({
  agents,
  boards = [],
  isLoading = false,
  sessionsLoading = false,
  sorting,
  onSortingChange,
  showActions = true,
  hiddenColumns,
  columnOrder,
  disableSorting = false,
  stickyHeader = false,
  emptyMessage = "No agents found.",
  emptyState,
  onDelete,
}: AgentsTableProps) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const resolvedSorting = sorting ?? internalSorting;
  const handleSortingChange: OnChangeFn<SortingState> =
    onSortingChange ??
    ((updater: Updater<SortingState>) => {
      setInternalSorting(updater);
    });

  const sortedAgents = useMemo<AgentWithGateway[]>(() => [...agents], [agents]);
  const columnVisibility = useMemo<VisibilityState>(
    () =>
      Object.fromEntries(
        (hiddenColumns ?? []).map((columnId) => [columnId, false])
      ),
    [hiddenColumns]
  );
  const boardNameById = useMemo(
    () => new Map(boards.map((board) => [board.id, board.name])),
    [boards]
  );

  const columns = useMemo<ColumnDef<AgentWithGateway>[]>(() => {
    const baseColumns: ColumnDef<AgentWithGateway>[] = [
      {
        accessorKey: "name",
        header: "Agent",
        cell: ({ row }) =>
          linkifyCell({
            href: `/agents/${row.original.id}`,
            label: row.original.name,
            subtitle: `ID ${row.original.id}`,
          }),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const liveStatus = row.original._sessionStatus;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {pillCell(row.original.status)}
              {liveStatus && liveStatus !== row.original.status ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SESSION_STATUS_COLORS[liveStatus] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {liveStatus}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "openclaw_session_id",
        header: "Session",
        cell: ({ row }) => (
          <span className="text-sm text-slate-700">
            {truncate(row.original.openclaw_session_id)}
          </span>
        ),
      },
      {
        accessorKey: "board_id",
        header: "Board",
        cell: ({ row }) => {
          const boardId = row.original.board_id;
          if (!boardId) {
            return <span className="text-sm text-slate-700">—</span>;
          }
          const boardName = boardNameById.get(boardId) ?? boardId;
          return linkifyCell({
            href: `/boards/${boardId}`,
            label: boardName,
            block: false,
          });
        },
      },
      {
        accessorKey: "gateway_id",
        header: "Gateway",
        cell: ({ row }) => {
          const name = row.original._gatewayName;
          if (!name) {
            return <span className="text-sm text-slate-400">—</span>;
          }
          const online = row.original._gatewayOnline;
          // Show pulsing dot when gateway online status is unknown (still loading)
          const isChecking = online === undefined || sessionsLoading;
          let dotClass = "animate-pulse bg-slate-300";
          if (!isChecking) {
            dotClass = online ? "bg-emerald-500" : "bg-slate-300";
          }
          return (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass}`}
              />
              <span className="text-sm text-slate-700">{name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "last_seen_at",
        header: "Last seen",
        cell: ({ row }) => {
          const liveTs = row.original._lastActivity;
          if (liveTs) {
            return (
              <div className="flex items-center gap-1">
                {dateCell(liveTs, { relative: true })}
                <span className="text-xs text-emerald-600">(live)</span>
              </div>
            );
          }
          return dateCell(row.original.last_seen_at, { relative: true });
        },
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => dateCell(row.original.updated_at),
      },
    ];

    return baseColumns;
  }, [boardNameById, sessionsLoading]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: sortedAgents,
    columns,
    enableSorting: !disableSorting,
    state: {
      ...(!disableSorting ? { sorting: resolvedSorting } : {}),
      ...(columnOrder ? { columnOrder } : {}),
      columnVisibility,
    },
    ...(disableSorting ? {} : { onSortingChange: handleSortingChange }),
    getCoreRowModel: getCoreRowModel(),
    ...(disableSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
  });

  return (
    <DataTable
      table={table}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      stickyHeader={stickyHeader}
      rowActions={
        showActions
          ? {
              getEditHref: (agent) => `/agents/${agent.id}/edit`,
              onDelete,
            }
          : undefined
      }
      rowClassName="hover:bg-slate-50"
      cellClassName="px-6 py-4"
      emptyState={
        emptyState
          ? {
              icon: emptyState.icon ?? DEFAULT_EMPTY_ICON,
              title: emptyState.title,
              description: emptyState.description,
              actionHref: emptyState.actionHref,
              actionLabel: emptyState.actionLabel,
            }
          : undefined
      }
    />
  );
}
