"use client";

import {
  Activity,
  CheckSquare,
  Cpu,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  ScrollText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { useMissionControl } from "@/store";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  priority: boolean;
}

interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: "core",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: <LayoutDashboard size={20} />,
        priority: true,
      },
      {
        id: "agents",
        label: "Agents",
        href: "/agents",
        icon: <Cpu size={20} />,
        priority: true,
      },
      {
        id: "tasks",
        label: "Tasks",
        href: "/boards/all",
        icon: <CheckSquare size={20} />,
        priority: true,
      },
    ],
  },
  {
    id: "observe",
    label: "OBSERVE",
    items: [
      {
        id: "activity",
        label: "Activity",
        href: "/activity",
        icon: <Activity size={20} />,
        priority: true,
      },
      {
        id: "logs",
        label: "Logs",
        href: "/activity/execution",
        icon: <ScrollText size={20} />,
        priority: false,
      },
    ],
  },
  {
    id: "admin",
    label: "ADMIN",
    items: [
      {
        id: "settings",
        label: "Settings",
        href: "/settings",
        icon: <Settings size={20} />,
        priority: false,
      },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

export function NavRail() {
  const pathname = usePathname();
  const {
    connection,
    sidebarExpanded,
    collapsedGroups,
    toggleSidebar,
    toggleGroup,
  } = useMissionControl();

  // Determine active tab based on pathname
  const activeTab =
    allNavItems.find((item) => pathname.startsWith(item.href))?.id ||
    "dashboard";

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === "[" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        )
      ) {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [toggleSidebar]);

  return (
    <>
      {/* Desktop: Grouped sidebar */}
      <nav
        aria-label="Main navigation"
        className={`hidden md:flex flex-col bg-card border-r border-border shrink-0 transition-all duration-200 ease-in-out ${
          sidebarExpanded ? "w-[220px]" : "w-14"
        }`}
      >
        {/* Header: Logo + toggle */}
        <div
          className={`flex items-center shrink-0 ${
            sidebarExpanded ? "px-3 py-3 gap-2.5" : "flex-col py-3 gap-2"
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-xs">
              OC
            </span>
          </div>
          {sidebarExpanded && (
            <span className="text-sm font-semibold text-foreground truncate flex-1">
              OpenClaw
            </span>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth shrink-0"
          >
            <Menu size={16} />
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {navGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {/* Divider between groups (not before first) */}
              {groupIndex > 0 && (
                <div
                  className={`my-1.5 border-t border-border ${
                    sidebarExpanded ? "mx-3" : "mx-2"
                  }`}
                />
              )}

              {/* Group header (expanded mode, only for groups with labels) */}
              {sidebarExpanded && group.label && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-3 mt-3 mb-1 group/header"
                >
                  <span className="text-[10px] tracking-wider text-muted-foreground/60 font-semibold select-none">
                    {group.label}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-3 h-3 text-muted-foreground/40 group-hover/header:text-muted-foreground transition-transform duration-150 ${
                      collapsedGroups.includes(group.id) ? "-rotate-90" : ""
                    }`}
                  >
                    <polyline points="4,6 8,10 12,6" />
                  </svg>
                </button>
              )}

              {/* Group items */}
              <div
                className={`overflow-hidden transition-all duration-150 ease-in-out ${
                  sidebarExpanded && collapsedGroups.includes(group.id)
                    ? "max-h-0 opacity-0"
                    : "max-h-[500px] opacity-100"
                }`}
              >
                <div
                  className={`flex flex-col ${
                    sidebarExpanded ? "gap-0.5 px-2" : "items-center gap-1"
                  }`}
                >
                  {group.items.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      expanded={sidebarExpanded}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Connection indicator */}
        <div
          className={`shrink-0 py-3 flex ${
            sidebarExpanded
              ? "px-3 items-center gap-2"
              : "flex-col items-center"
          }`}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              connection.isConnected ? "bg-green-500 pulse-dot" : "bg-red-500"
            }`}
            title={
              connection.isConnected
                ? "Gateway connected"
                : "Gateway disconnected"
            }
          />
          {sidebarExpanded && (
            <span className="text-xs text-muted-foreground truncate">
              {connection.isConnected ? "Connected" : "Disconnected"}
            </span>
          )}
        </div>
      </nav>

      {/* Mobile: Bottom tab bar */}
      <MobileBottomBar activeTab={activeTab} />
    </>
  );
}

function NavButton({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  if (expanded) {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-smooth relative ${
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
      >
        {active && (
          <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
        )}
        <div className="w-5 h-5 shrink-0">{item.icon}</div>
        <span className="text-sm truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-smooth group relative ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      <div className="w-5 h-5">{item.icon}</div>
      {/* Tooltip */}
      <span className="absolute left-full ml-2 px-2 py-1 text-xs font-medium bg-popover text-popover-foreground border border-border rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
        {item.label}
      </span>
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
      )}
    </Link>
  );
}

function MobileBottomBar({ activeTab }: { activeTab: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const priorityItems = allNavItems.filter((i) => i.priority);
  const nonPriorityIds = new Set(
    allNavItems.filter((i) => !i.priority).map((i) => i.id)
  );
  const moreIsActive = nonPriorityIds.has(activeTab);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around px-1 h-14">
          {priorityItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-smooth min-w-[48px] min-h-[48px] ${
                activeTab === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="w-5 h-5">{item.icon}</div>
              <span className="text-[10px] font-medium truncate">
                {item.label}
              </span>
            </Link>
          ))}
          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-smooth min-w-[48px] min-h-[48px] relative ${
              moreIsActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="w-5 h-5">
              <MoreHorizontal size={20} />
            </div>
            <span className="text-[10px] font-medium">More</span>
            {moreIsActive && (
              <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </nav>

      {/* Bottom sheet */}
      <MobileBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activeTab={activeTab}
      />
    </>
  );
}

function MobileBottomSheet({
  open,
  onClose,
  activeTab,
}: {
  open: boolean;
  onClose: () => void;
  activeTab: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [open]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[70vh] overflow-y-auto safe-area-bottom transition-transform duration-200 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-4 pb-6">
          {navGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {groupIndex > 0 && (
                <div className="my-3 border-t border-border" />
              )}
              <div className="px-1 pt-1 pb-2">
                <span className="text-[10px] tracking-wider text-muted-foreground/60 font-semibold">
                  {group.label || "CORE"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => handleClose()}
                    className={`flex items-center gap-2.5 px-3 min-h-[48px] rounded-xl transition-smooth ${
                      activeTab === item.id
                        ? "bg-primary/15 text-primary"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <div className="w-5 h-5 shrink-0">{item.icon}</div>
                    <span className="text-xs font-medium truncate">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
