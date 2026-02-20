"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

import { FilterPanel } from "./FilterPanel";
import { ProjectTaskCard } from "./TaskCard";

type TaskStatus = "inbox" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "critical";

interface ApiTask {
  id: string;
  boardId: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId: string | null;
  dueAt: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiBoard {
  id: string;
  name: string;
  slug: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const COLUMNS: { title: string; status: TaskStatus; dot: string; badge: string }[] = [
  { title: "Inbox", status: "inbox", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
  { title: "In Progress", status: "in_progress", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700" },
  { title: "Review", status: "review", dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700" },
  { title: "Done", status: "done", dot: "bg-green-500", badge: "bg-emerald-100 text-emerald-700" },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function KanbanBoard() {
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([]);

  // Fetch all boards
  const boardsQuery = useQuery({
    queryKey: ["project-board", "boards"],
    queryFn: () => fetchJson<PaginatedResponse<ApiBoard>>("/api/v1/boards?limit=200"),
    staleTime: 30_000,
  });

  const boards = boardsQuery.data?.items ?? [];

  // Determine which board IDs to fetch tasks from
  const activeBoardIds = selectedBoardIds.length > 0 ? selectedBoardIds : boards.map((b) => b.id);

  // Fetch tasks for all active boards (one query per board, deduplicated by key)
  const tasksQueries = useQuery({
    queryKey: ["project-board", "tasks", activeBoardIds.sort().join(",")],
    queryFn: async () => {
      if (activeBoardIds.length === 0) return [];
      const results = await Promise.all(
        activeBoardIds.map((boardId) =>
          fetchJson<PaginatedResponse<ApiTask>>(
            `/api/v1/boards/${boardId}/tasks?limit=200`,
          ).then((res) => res.items.map((task) => ({ ...task, _boardId: boardId }))),
        ),
      );
      return results.flat();
    },
    enabled: boards.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const allTasks = tasksQueries.data ?? [];

  // Board name lookup
  const boardNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const board of boards) {
      map.set(board.id, board.name);
    }
    return map;
  }, [boards]);

  // Apply client-side filters
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(task.status)) {
        return false;
      }
      if (selectedPriorities.length > 0 && !selectedPriorities.includes(task.priority)) {
        return false;
      }
      return true;
    });
  }, [allTasks, selectedStatuses, selectedPriorities]);

  // Group tasks by status
  const grouped = useMemo(() => {
    const buckets: Record<TaskStatus, typeof filteredTasks> = {
      inbox: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const task of filteredTasks) {
      const bucket = buckets[task.status];
      if (bucket) bucket.push(task);
      else buckets.inbox.push(task);
    }
    return buckets;
  }, [filteredTasks]);

  const handleBoardToggle = useCallback((boardId: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(boardId) ? prev.filter((id) => id !== boardId) : [...prev, boardId],
    );
  }, []);

  const handleStatusToggle = useCallback((status: TaskStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }, []);

  const handlePriorityToggle = useCallback((priority: TaskPriority) => {
    setSelectedPriorities((prev) =>
      prev.includes(priority) ? prev.filter((p) => p !== priority) : [...prev, priority],
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedBoardIds([]);
    setSelectedStatuses([]);
    setSelectedPriorities([]);
  }, []);

  const isLoading = boardsQuery.isLoading || tasksQueries.isLoading;

  return (
    <div className="flex h-full">
      <FilterPanel
        boards={boards}
        selectedBoardIds={selectedBoardIds}
        onBoardToggle={handleBoardToggle}
        selectedStatuses={selectedStatuses}
        onStatusToggle={handleStatusToggle}
        selectedPriorities={selectedPriorities}
        onPriorityToggle={handlePriorityToggle}
        onClearAll={handleClearAll}
      />
      <div className="flex-1 overflow-x-auto p-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading tasks...
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {COLUMNS.map((column) => {
              const columnTasks = grouped[column.status] ?? [];
              return (
                <div key={column.status} className="min-h-[calc(100vh-280px)]">
                  <div className="sticky top-0 z-10 rounded-t-xl border border-b-0 border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", column.dot)} />
                        <h3 className="text-sm font-semibold text-slate-900">
                          {column.title}
                        </h3>
                      </div>
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          column.badge,
                        )}
                      >
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-3">
                    <div className="space-y-3">
                      {columnTasks.map((task) => (
                        <ProjectTaskCard
                          key={task.id}
                          title={task.title}
                          boardName={boardNameMap.get(task.boardId ?? "") ?? "Unknown"}
                          priority={task.priority}
                          assignee={task.assignedAgentId}
                          dueAt={task.dueAt}
                          status={task.status}
                        />
                      ))}
                      {columnTasks.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-400">
                          No tasks
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
