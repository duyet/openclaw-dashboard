"use client";

export const runtime = "edge";

import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { cn } from "@/lib/utils";
import { getLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";

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

async function fetchJson<T>(url: string): Promise<T> {
  const headers = new Headers();
  if (isLocalAuthMode()) {
    const token = getLocalAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { credentials: "include", headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

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
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { isSignedIn } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Boards
  const boardsQuery = useQuery({
    queryKey: ["calendar", "boards"],
    queryFn: () =>
      fetchJson<{ items: ApiBoard[] }>("/api/v1/boards?limit=200"),
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
            res.items.map<ApiTaskWithBoard>((t) => ({ ...t, _boardId: boardId }))
          )
        )
      );
      return results.flat();
    },
    enabled: boards.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const allTasks = tasksQuery.data ?? [];

  // Agents (for scheduled cronjobs)
  const agentsQuery = useQuery({
    queryKey: ["calendar", "agents"],
    queryFn: () =>
      fetchJson<{ items: ApiAgent[] }>("/api/v1/agents?limit=200"),
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
    const map = new Map<number, ApiTaskWithBoard[]>();
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

  const isLoading =
    boardsQuery.isLoading || tasksQuery.isLoading || agentsQuery.isLoading;

  const isError =
    boardsQuery.isError || tasksQuery.isError || agentsQuery.isError;

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
                          <div
                            key={task.id}
                            title={`${task.title} · ${boardNameMap.get(task._boardId) ?? ""}`}
                            className={cn(
                              "truncate rounded border px-1.5 py-0.5 text-[11px] leading-4",
                              STATUS_COLOR[task.status] ?? STATUS_COLOR.inbox
                            )}
                          >
                            {task.title}
                          </div>
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
                      Last seen:{" "}
                      {new Date(agent.last_seen_at).toLocaleString()}
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
            {tasksQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tasks due in the next 7 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingTasks.map((task) => (
                  <li key={task.id}>
                    <div className="truncate text-xs font-medium text-foreground/90">
                      {task.title}
                    </div>
                    <div className="text-xs text-muted-foreground/60">
                      {new Date(task.due_at!).toLocaleDateString()}
                      {boardNameMap.get(task._boardId)
                        ? ` · ${boardNameMap.get(task._boardId)}`
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </DashboardPageLayout>
  );
}
