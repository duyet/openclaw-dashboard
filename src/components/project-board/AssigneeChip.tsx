"use client";

import { Bot, UserCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface AssigneeChipProps {
  name: string;
  type?: "agent" | "user" | "unassigned";
  className?: string;
}

export function AssigneeChip({
  name,
  type = "unassigned",
  className,
}: AssigneeChipProps) {
  const Icon = type === "agent" ? Bot : UserCircle;
  const colorClasses =
    type === "agent"
      ? "bg-purple-50 text-purple-700 border-purple-200"
      : type === "user"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-slate-50 text-slate-500 border-slate-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        colorClasses,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {name}
    </span>
  );
}
