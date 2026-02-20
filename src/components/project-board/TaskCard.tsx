"use client";

import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import { parseApiDatetime } from "@/lib/datetime";

import { AssigneeChip } from "./AssigneeChip";

type TaskPriority = "low" | "medium" | "high" | "critical";

interface ProjectTaskCardProps {
  title: string;
  boardName: string;
  priority: TaskPriority;
  assignee?: string | null;
  dueAt?: string | null;
  status: string;
}

const priorityStyles: Record<TaskPriority, string> = {
  critical: "bg-rose-100 text-rose-700",
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

export function ProjectTaskCard({
  title,
  boardName,
  priority,
  assignee,
  dueAt,
  status,
}: ProjectTaskCardProps) {
  const dueDate = parseApiDatetime(dueAt);
  const now = new Date();
  const isOverdue =
    dueDate !== null && status !== "done" && dueDate.getTime() < now.getTime();
  const dueLabel = dueDate
    ? dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900 line-clamp-2">
          {title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            priorityStyles[priority] ?? priorityStyles.medium,
          )}
        >
          {priority}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-slate-400">
        {boardName}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <AssigneeChip
          name={assignee ?? "Unassigned"}
          type={assignee ? "agent" : "unassigned"}
        />
        {dueLabel ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px]",
              isOverdue
                ? "font-semibold text-rose-600"
                : "text-slate-500",
            )}
          >
            <CalendarClock
              className={cn(
                "h-3.5 w-3.5",
                isOverdue ? "text-rose-500" : "text-slate-400",
              )}
            />
            {isOverdue ? `Overdue` : dueLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
