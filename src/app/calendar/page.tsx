"use client";

export const runtime = "edge";

import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Server,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useListGatewaysApiV1GatewaysGet } from "@/api/generated/gateways/gateways";
import type { GatewayRead, OrganizationRead } from "@/api/generated/model";
import { useGetMyOrgApiV1OrganizationsMeGet } from "@/api/generated/organizations/organizations";
import { useAuth } from "@/auth/clerk";
import { customFetch } from "@/api/mutator";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type GatewayTask, getTaskHistory } from "@/lib/services/gateway-rpc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiTask = {
  id: string;
  title: string;
  status: string;
  due_at?: string | null;
};

type ApiTaskWithBoard = ApiTask & { _boardId: string };

type ApiTaskWithGateway = ApiTask & {
  _gatewayId: string;
  _gatewayName: string;
  _gatewayTask: GatewayTask;
};

type ApiTaskWithSource = ApiTaskWithBoard | ApiTaskWithGateway;

type ApiBoard = { id: string; name: string };

type ApiAgent = {
  id: string;
  name: string;
  heartbeat_config?: Record<string, unknown> | null;
  last_seen_at?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const response = await customFetch<{ data: T; status: number }>(url, {
    method: "GET",
  });
  return response.data;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array<null>(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const STATUS_COLOR: Record<string, string> = {
  inbox: "bg-muted/40 text-foreground/90 border-border",
  in_progress: "bg-primary/5 text-primary border-primary/30",
  review: "bg-purple-50 text-purple-700 border-purple-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // Server task status colors
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

// Server status to our status mapping
const GATEWAY_STATUS_MAP: Record<string, string> = {
  pending: "pending",
  running: "running",
  completed: "done",
  failed: "failed",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { isSignedIn } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedTask, setSelectedTask] = useState<ApiTaskWithSource | null>(
    null
  );

  // Active organization
  const myOrgQuery = useGetMyOrgApiV1OrganizationsMeGet<
    { data: OrganizationRead; status: 200 },
    { message: string; status: number }
  >({
    query: {
      enabled: Boolean(isSignedIn),
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });
  const activeOrgId = myOrgQuery.data?.data?.id ?? null;

  // Boards
  const boardsQuery = useQuery({
    queryKey: ["calendar", "boards"],
    queryFn: () => fetchJson<{ items: ApiBoard[] }>("/api/v1/boards?limit=200"),
    enabled: Boolean(isSignedIn),
    staleTime: 60_000,
  });
  const boards = boardsQuery.data?.items ?? [];

  // Tasks across all boards
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const tasksQuery = useQuery({
    queryKey: ["calendar", "tasks", boardIds.sort().join(",")],
    queryFn: async () => {
      if (boardIds.length === 0) return [] as ApiTaskWithBoard[];
      const results = await Promise.all(
        boardIds.map((boardId) =>
          fetchJson<{ items: ApiTask[] }>(
            `/api/v1/boards/${boardId}/tasks?limit=500`
          ).then((res) =>
            res.items.map<ApiTaskWithBoard>((t) => ({
              ...t,
              _boardId: boardId,
            }))
          )
        )
      );
      return results.flat();
    },
    enabled: boards.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const boardTasks = tasksQuery.data ?? [];

  // Gateways for active organization
  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    { data: { items: GatewayRead[] }; status: 200 },
    { message: string; status: number }
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(activeOrgId),
        staleTime: 30_000,
        refetchInterval: 60_000,
      },
    }
  );
  const gateways = gatewaysQuery.data?.data?.items ?? [];

  // Gateway task history
  const gatewayTasksQuery = useQuery({
    queryKey: [
      "calendar",
      "gateway-tasks",
      gateways.map((g: GatewayRead) => g.id).join(","),
    ],
    queryFn: async () => {
      if (gateways.length === 0) return [] as ApiTaskWithGateway[];

      // Fetch tasks from all gateways in parallel with timeout
      const timeout = 10000; // 10s timeout per gateway
      const results = await Promise.allSettled(
        gateways.map(async (gateway: GatewayRead) => {
          try {
            const tasks = await Promise.race([
              getTaskHistory(
                { url: gateway.url, token: gateway.token ?? null },
                { limit: 100 }
              ),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Server RPC timeout")),
                  timeout
                )
              ),
            ]);
            return tasks
              .filter((t) => t.due_at) // Only tasks with due dates
              .map<ApiTaskWithGateway>((task) => ({
                id: `gateway-${gateway.id}-${task.id}`,
                title: task.name,
                status: GATEWAY_STATUS_MAP[task.status] ?? task.status,
                due_at: task.due_at,
                _gatewayId: gateway.id,
                _gatewayName: gateway.name,
                _gatewayTask: task,
              }));
          } catch {
            // Server offline or error — return empty array
            return [] as ApiTaskWithGateway[];
          }
        })
      );

      return results
        .filter(
          (result): result is PromiseFulfilledResult<ApiTaskWithGateway[]> =>
            result.status === "fulfilled"
        )
        .flatMap(
          (result: PromiseFulfilledResult<ApiTaskWithGateway[]>) => result.value
        );
    },
    enabled: gateways.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const gatewayTasks = gatewayTasksQuery.data ?? [];

  // Combine board and gateway tasks
  const allTasks = useMemo(
    () => [...boardTasks, ...gatewayTasks],
    [boardTasks, gatewayTasks]
  );

  // Agents (for scheduled cronjobs)
  const agentsQuery = useQuery({
    queryKey: ["calendar", "agents"],
    queryFn: () => fetchJson<{ items: ApiAgent[] }>("/api/v1/agents?limit=200"),
    enabled: Boolean(isSignedIn),
    staleTime: 30_000,
  });
  const agents = agentsQuery.data?.items ?? [];
  const scheduledAgents = agents.filter((a) => a.heartbeat_config?.every);

  // Board name map
  const boardNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of boards) m.set(b.id, b.name);
    return m;
  }, [boards]);

  // Tasks grouped by calendar day (current month only)
  const tasksByDay = useMemo(() => {
    const map = new Map<number, ApiTaskWithSource[]>();
    for (const task of allTasks) {
      if (!task.due_at) continue;
      const d = new Date(task.due_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const bucket = map.get(day) ?? [];
      bucket.push(task);
      map.set(day, bucket);
    }
    return map;
  }, [allTasks, year, month]);

  // Upcoming tasks (next 7 days, not done)
  const upcomingTasks = useMemo(() => {
    const nowMs = Date.now();
    const cutoff = nowMs + 7 * 24 * 60 * 60 * 1000;
    return allTasks
      .filter((t) => {
        if (!t.due_at || t.status === "done") return false;
        const ms = new Date(t.due_at).getTime();
        return ms >= nowMs && ms <= cutoff;
      })
      .sort(
        (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
      )
      .slice(0, 10);
  }, [allTasks]);

  const calendarDays = useMemo(
    () => buildCalendarGrid(year, month),
    [year, month]
  );

  const isToday = (day: number) =>
    day === now.getDate() &&
    month === now.getMonth() &&
    year === now.getFullYear();

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Check if task is from gateway
  const isGatewayTask = (
    task: ApiTaskWithSource
  ): task is ApiTaskWithGateway => {
    return "_gatewayId" in task;
  };

  const isLoading =
    boardsQuery.isLoading ||
    tasksQuery.isLoading ||
    agentsQuery.isLoading ||
    gatewaysQuery.isLoading ||
    gatewayTasksQuery.isLoading;

  const isError =
    boardsQuery.isError ||
    tasksQuery.isError ||
    agentsQuery.isError ||
    gatewaysQuery.isError ||
    gatewayTasksQuery.isError;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view the calendar.",
        forceRedirectUrl: "/calendar",
      }}
      title="Calendar"
      description="Task due dates and agent schedules."
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground/80 shadow-sm transition hover:bg-accent/50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-foreground/90">
            {MONTHS[month]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground/80 shadow-sm transition hover:bg-accent/50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
      contentClassName="p-0"
    >
      <div className="flex min-h-0 flex-1">
        {/* ── Calendar grid ─────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {/* Day-of-week headers */}
          <div className="mb-1 grid grid-cols-7">
            {DAYS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid cells */}
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm">
            {calendarDays.map((day, i) => {
              const dayTasks = day ? (tasksByDay.get(day) ?? []) : [];
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[108px] p-2",
                    day ? "bg-card" : "bg-muted/40"
                  )}
                >
                  {day ? (
                    <>
                      <span
                        className={cn(
                          "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday(day)
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground/80"
                        )}
                      >
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className="w-full text-left truncate rounded border px-1.5 py-0.5 text-[11px] leading-4 transition hover:opacity-80"
                            title={
                              isGatewayTask(task)
                                ? `${task.title} · ${task._gatewayName}`
                                : `${task.title} · ${boardNameMap.get(task._boardId) ?? ""}`
                            }
                            style={{
                              backgroundColor: isGatewayTask(task)
                                ? undefined
                                : undefined,
                            }}
                          >
                            <div
                              className={cn(
                                "flex items-center gap-1",
                                STATUS_COLOR[task.status] ?? STATUS_COLOR.inbox
                              )}
                            >
                              {isGatewayTask(task) ? (
                                <Server className="h-3 w-3 shrink-0" />
                              ) : null}
                              <span className="truncate">{task.title}</span>
                            </div>
                          </button>
                        ))}
                        {dayTasks.length > 3 ? (
                          <div className="text-[11px] text-muted-foreground/60">
                            +{dayTasks.length - 3} more
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {isError ? (
            <p className="mt-4 text-sm text-destructive/80">
              Failed to load calendar data. Please refresh.
            </p>
          ) : null}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card p-5">
          {/* Scheduled agents (cronjobs) */}
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground/60" />
            <h2 className="text-sm font-semibold text-foreground/90">
              Agent schedules
            </h2>
          </div>

          {agentsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : scheduledAgents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No agents with a heartbeat schedule.
            </p>
          ) : (
            <ul className="space-y-2">
              {scheduledAgents.map((agent) => (
                <li
                  key={agent.id}
                  className="rounded-lg border border-border p-3"
                >
                  <Link
                    href={`/agents/${agent.id}`}
                    className="text-sm font-medium text-foreground/90 hover:text-primary"
                  >
                    {agent.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    Every {String(agent.heartbeat_config?.every ?? "—")}
                  </div>
                  {agent.last_seen_at ? (
                    <div className="mt-0.5 text-xs text-muted-foreground/60">
                      Last seen: {new Date(agent.last_seen_at).toLocaleString()}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {/* Upcoming due tasks */}
          <div className="mt-6 border-t border-border/50 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground/60" />
              <h2 className="text-sm font-semibold text-foreground/90">
                Due in 7 days
              </h2>
            </div>
            {tasksQuery.isLoading || gatewayTasksQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tasks due in the next 7 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingTasks.map((task) => (
                  <li key={task.id}>
                    <div className="flex items-center gap-1">
                      {isGatewayTask(task) ? (
                        <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      ) : null}
                      <div className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                        {task.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                      <span>{new Date(task.due_at!).toLocaleDateString()}</span>
                      {isGatewayTask(task) ? (
                        <>
                          <span>·</span>
                          <span className="truncate">{task._gatewayName}</span>
                        </>
                      ) : boardNameMap.get(task._boardId) ? (
                        <>
                          <span>·</span>
                          <span className="truncate">
                            {boardNameMap.get(task._boardId)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── Task Detail Dialog ───────────────────────────────────── */}
      <Dialog
        open={selectedTask !== null}
        onOpenChange={(open) => !open && setSelectedTask(null)}
      >
        <DialogContent>
          {selectedTask ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {isGatewayTask(selectedTask) ? (
                    <>
                      <Server className="h-5 w-5 text-muted-foreground/60" />
                      {selectedTask._gatewayTask.name}
                    </>
                  ) : (
                    selectedTask.title
                  )}
                </DialogTitle>
                <DialogDescription>
                  {isGatewayTask(selectedTask)
                    ? `Task from ${selectedTask._gatewayName}`
                    : `Task from ${
                        boardNameMap.get(selectedTask._boardId) ??
                        "Unknown board"
                      }`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Task metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="font-medium">{selectedTask.status}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due date</span>
                    <div className="font-medium">
                      {selectedTask.due_at
                        ? new Date(selectedTask.due_at).toLocaleString()
                        : "Not set"}
                    </div>
                  </div>
                  {isGatewayTask(selectedTask) && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Agent</span>
                        <div className="font-medium">
                          {selectedTask._gatewayTask.agent_name ?? "—"}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created</span>
                        <div className="font-medium">
                          {new Date(
                            selectedTask._gatewayTask.created_at
                          ).toLocaleString()}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Server task details */}
                {isGatewayTask(selectedTask) && (
                  <>
                    {selectedTask._gatewayTask.error && (
                      <div>
                        <span className="text-sm font-medium text-destructive">
                          Error
                        </span>
                        <pre className="mt-1 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                          {selectedTask._gatewayTask.error}
                        </pre>
                      </div>
                    )}

                    {selectedTask._gatewayTask.result && (
                      <div>
                        <span className="text-sm font-medium">Result</span>
                        <pre className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-muted p-3 text-xs">
                          {JSON.stringify(
                            selectedTask._gatewayTask.result,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  );
}
