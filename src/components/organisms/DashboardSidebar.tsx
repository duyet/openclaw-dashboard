"use client";

import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  Folder,
  Kanban,
  LayoutGrid,
  Network,
  Settings,
  Store,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import type { ApiError } from "@/api/mutator";
import { useAuth } from "@/auth/clerk";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    }
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Overview
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/dashboard"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname === "/dashboard"
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/activity"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/activity")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Activity className="h-4 w-4" />
                Live feed
              </Link>
              <Link
                href="/project-board"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/project-board")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Kanban className="h-4 w-4" />
                Project board
              </Link>
              <Link
                href="/calendar"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/calendar")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                Calendar
              </Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Boards
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/board-groups"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/board-groups")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Folder className="h-4 w-4" />
                Board groups
              </Link>
              <Link
                href="/boards"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/boards")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Boards
              </Link>
              <Link
                href="/tags"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/tags")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Tags className="h-4 w-4" />
                Tags
              </Link>
              <Link
                href="/approvals"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/approvals")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approvals
              </Link>
              {isAdmin ? (
                <Link
                  href="/custom-fields"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                    pathname.startsWith("/custom-fields")
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Custom fields
                </Link>
              ) : null}
            </div>
          </div>

          <div>
            {isAdmin ? (
              <>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Skills
                </p>
                <div className="mt-1 space-y-1">
                  <Link
                    href="/skills/marketplace"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                      pathname === "/skills" ||
                        pathname.startsWith("/skills/marketplace")
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent"
                    )}
                  >
                    <Store className="h-4 w-4" />
                    Marketplace
                  </Link>
                  <Link
                    href="/skills/packs"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                      pathname.startsWith("/skills/packs")
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent"
                    )}
                  >
                    <Boxes className="h-4 w-4" />
                    Packs
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Administration
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/organization"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                  pathname.startsWith("/organization")
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <Building2 className="h-4 w-4" />
                Organization
              </Link>
              {isAdmin ? (
                <Link
                  href="/gateways"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                    pathname.startsWith("/gateways")
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <Network className="h-4 w-4" />
                  Gateways
                </Link>
              ) : null}
              {isAdmin ? (
                <Link
                  href="/agents"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/90 transition",
                    pathname.startsWith("/agents")
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  <Bot className="h-4 w-4" />
                  Agents
                </Link>
              ) : null}
            </div>
          </div>
        </nav>
      </div>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-muted-foreground/40"
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  );
}
