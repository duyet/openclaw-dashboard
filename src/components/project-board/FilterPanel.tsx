"use client";

import { Filter, X } from "lucide-react";

import { cn } from "@/lib/utils";

type TaskStatus = "inbox" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "critical";

interface Board {
  id: string;
  name: string;
}

interface FilterPanelProps {
  boards: Board[];
  selectedBoardIds: string[];
  onBoardToggle: (boardId: string) => void;
  selectedStatuses: TaskStatus[];
  onStatusToggle: (status: TaskStatus) => void;
  selectedPriorities: TaskPriority[];
  onPriorityToggle: (priority: TaskPriority) => void;
  onClearAll: () => void;
}

const ALL_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

const ALL_PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: "critical", label: "Critical", color: "bg-rose-500" },
  { key: "high", label: "High", color: "bg-rose-400" },
  { key: "medium", label: "Medium", color: "bg-amber-400" },
  { key: "low", label: "Low", color: "bg-emerald-400" },
];

export function FilterPanel({
  boards,
  selectedBoardIds,
  onBoardToggle,
  selectedStatuses,
  onStatusToggle,
  selectedPriorities,
  onPriorityToggle,
  onClearAll,
}: FilterPanelProps) {
  const hasActiveFilters =
    selectedBoardIds.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedPriorities.length > 0;

  return (
    <aside className="w-64 shrink-0 space-y-6 border-r border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>

      {/* Board filter */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Boards
        </p>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {boards.map((board) => {
            const selected = selectedBoardIds.includes(board.id);
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => onBoardToggle(board.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition",
                  selected
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full border",
                    selected
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 bg-white",
                  )}
                />
                <span className="truncate">{board.name}</span>
              </button>
            );
          })}
          {boards.length === 0 ? (
            <p className="px-2 text-xs text-slate-400">No boards found</p>
          ) : null}
        </div>
      </div>

      {/* Status filter */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Status
        </p>
        <div className="space-y-1">
          {ALL_STATUSES.map(({ key, label }) => {
            const selected = selectedStatuses.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onStatusToggle(key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition",
                  selected
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full border",
                    selected
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 bg-white",
                  )}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority filter */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Priority
        </p>
        <div className="space-y-1">
          {ALL_PRIORITIES.map(({ key, label, color }) => {
            const selected = selectedPriorities.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPriorityToggle(key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition",
                  selected
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    selected ? color : "border border-slate-300 bg-white",
                  )}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
