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
import { useMemo, useState } from "react";

import type { GatewayRead } from "@/api/generated/model";
import { dateCell, linkifyCell } from "@/components/tables/cell-formatters";
import {
  DataTable,
  type DataTableEmptyState,
} from "@/components/tables/DataTable";
import { truncateText as truncate } from "@/lib/formatters";

type GatewaysTableProps = {
  gateways: GatewayRead[];
  isLoading?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  stickyHeader?: boolean;
  showActions?: boolean;
  hiddenColumns?: string[];
  columnOrder?: string[];
  disableSorting?: boolean;
  onDelete?: (gateway: GatewayRead) => void;
  emptyMessage?: string;
  emptyState?: Omit<DataTableEmptyState, "icon"> & {
    icon?: DataTableEmptyState["icon"];
  };
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
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

export function GatewaysTable({
  gateways,
  isLoading = false,
  sorting,
  onSortingChange,
  stickyHeader = false,
  showActions = true,
  hiddenColumns,
  columnOrder,
  disableSorting = false,
  onDelete,
  emptyMessage = "No gateways found.",
  emptyState,
}: GatewaysTableProps) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const resolvedSorting = sorting ?? internalSorting;
  const handleSortingChange: OnChangeFn<SortingState> =
    onSortingChange ??
    ((updater: Updater<SortingState>) => {
      setInternalSorting(updater);
    });

  const sortedGateways = useMemo(() => [...gateways], [gateways]);
  const columnVisibility = useMemo<VisibilityState>(
    () =>
      Object.fromEntries(
        (hiddenColumns ?? []).map((columnId) => [columnId, false])
      ),
    [hiddenColumns]
  );

  const columns = useMemo<ColumnDef<GatewayRead>[]>(() => {
    const baseColumns: ColumnDef<GatewayRead>[] = [
      {
        accessorKey: "name",
        header: "Gateway",
        cell: ({ row }) =>
          linkifyCell({
            href: `/gateways/${row.original.id}`,
            label: row.original.name,
            subtitle: truncate(row.original.url, 36),
          }),
      },
      {
        accessorKey: "workspace_root",
        header: "Workspace root",
        cell: ({ row }) => (
          <span className="text-sm text-slate-700">
            {truncate(row.original.workspace_root, 28)}
          </span>
        ),
      },
      {
        accessorKey: "device_token",
        header: "Approval Status",
        cell: ({ row }) => {
          const gateway = row.original as unknown as Record<string, unknown>;
          const deviceToken = gateway?.device_token;
          const grantedAt = gateway?.device_token_granted_at;

          if (deviceToken) {
            const relativeDate = grantedAt
              ? dateCell(grantedAt as string, { relative: true })
              : null;

            return (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-emerald-700">Paired</span>
                {relativeDate && (
                  <span className="text-xs text-slate-500">({relativeDate})</span>
                )}
              </div>
            );
          }

          return (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-sm text-amber-700">Pending</span>
            </div>
          );
        },
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => dateCell(row.original.updated_at),
      },
    ];

    return baseColumns;
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: sortedGateways,
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
      stickyHeader={stickyHeader}
      emptyMessage={emptyMessage}
      rowActions={
        showActions
          ? {
              getEditHref: (gateway) => `/gateways/${gateway.id}/edit`,
              onDelete,
            }
          : undefined
      }
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
