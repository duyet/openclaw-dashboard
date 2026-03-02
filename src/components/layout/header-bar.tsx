"use client";

import { Bell, Laptop, MessageSquare, Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMissionControl } from "@/store";

export function HeaderBar() {
  const { activeTab, connection, currentUser, setCurrentUser } =
    useMissionControl();

  const { theme, setTheme } = useTheme();

  const tabLabels: Record<string, string> = {
    dashboard: "Dashboard",
    agents: "Agents",
    tasks: "Task Board",
    activity: "Activity Feed",
    logs: "Execution Logs",
    settings: "Settings",
  };

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
  };

  return (
    <header
      aria-label="Application header"
      className="h-14 bg-card/80 backdrop-blur-sm border-b border-border px-4 flex items-center justify-between shrink-0"
    >
      {/* Left: Page title + breadcrumb */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-foreground">
          {tabLabels[activeTab] || "Mission Control"}
        </h1>
        <span className="text-2xs text-muted-foreground font-mono-tight">
          v2.0
        </span>
      </div>

      {/* Center: Search trigger + Quick stats (desktop only) */}
      <div className="hidden md:flex items-center gap-4">
        <button
          onClick={() => {
            setSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 50);
          }}
          className="flex items-center gap-2 h-8 px-3 rounded-md bg-secondary/50 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <Search size={14} />
          <span>Search...</span>
          <kbd className="text-2xs px-1 py-0.5 rounded bg-muted border border-border font-mono ml-2">
            &#8984;K
          </kbd>
        </button>

        <ConnectionBadge connection={connection} onReconnect={() => {}} />
      </div>

      {/* Mobile connection dot */}
      <MobileConnectionDot connection={connection} onReconnect={() => {}} />

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Mobile search trigger */}
        <button
          onClick={() => {
            setSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 50);
          }}
          className="md:hidden h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center"
          title="Search"
        >
          <Search size={16} />
        </button>

        {/* Chat toggle placeholder */}
        <button className="hidden md:flex h-8 px-2.5 rounded-md text-xs font-medium transition-smooth items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary">
          <MessageSquare size={14} />
          Chat
        </button>

        {/* Notifications placeholder */}
        <button className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center relative">
          <Bell size={16} />
        </button>

        {/* Simple Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth flex items-center justify-center relative"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* User menu placeholder */}
        <div className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center ml-2">
          OC
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div ref={searchRef} className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
            onClick={() => setSearchOpen(false)}
          />
          <div className="absolute top-14 left-1/2 -translate-x-1/2 w-[min(24rem,calc(100vw-2rem))] bg-card border border-border rounded-lg shadow-[var(--shadow-panel)] overflow-hidden animate-fade-in-up">
            <div className="p-2 border-b border-border">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="Search..."
                className="w-full h-10 px-3 rounded-md bg-secondary border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              <div className="p-8 text-center text-xs text-muted-foreground">
                Search coming soon...
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileConnectionDot({
  connection,
  onReconnect,
}: {
  connection: { isConnected: boolean; reconnectAttempts: number };
  onReconnect: () => void;
}) {
  const isReconnecting =
    !connection.isConnected && connection.reconnectAttempts > 0;

  let dotClass: string;
  let title: string;

  if (connection.isConnected) {
    dotClass = "bg-green-500";
    title = "Connected";
  } else if (isReconnecting) {
    dotClass = "bg-amber-500 animate-pulse";
    title = `Reconnecting (${connection.reconnectAttempts})`;
  } else {
    dotClass = "bg-red-500 animate-pulse";
    title = "Disconnected";
  }

  return (
    <button
      onClick={!connection.isConnected ? onReconnect : undefined}
      className={`md:hidden flex items-center justify-center h-8 w-8 rounded-md ${
        connection.isConnected
          ? "cursor-default"
          : "hover:bg-secondary cursor-pointer"
      } transition-smooth`}
      title={title}
    >
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
    </button>
  );
}

function ConnectionBadge({
  connection,
  onReconnect,
}: {
  connection: {
    isConnected: boolean;
    reconnectAttempts: number;
    latency?: number;
  };
  onReconnect: () => void;
}) {
  const isReconnecting =
    !connection.isConnected && connection.reconnectAttempts > 0;

  let dotClass: string;
  let label: string;

  if (connection.isConnected) {
    dotClass = "bg-green-500";
    label = connection.latency != null ? `${connection.latency}ms` : "Online";
  } else if (isReconnecting) {
    dotClass = "bg-amber-500 animate-pulse";
    label = `Connecting... (${connection.reconnectAttempts})`;
  } else {
    dotClass = "bg-red-500 animate-pulse";
    label = "Disconnected";
  }

  return (
    <button
      onClick={!connection.isConnected ? onReconnect : undefined}
      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-smooth ${
        connection.isConnected
          ? "cursor-default"
          : "hover:bg-secondary cursor-pointer"
      }`}
      title={
        connection.isConnected ? "System connected" : "System disconnected"
      }
    >
      <span className="text-muted-foreground">System</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <span
        className={`font-medium font-mono-tight ${
          connection.isConnected
            ? "text-green-400"
            : isReconnecting
              ? "text-amber-400"
              : "text-red-400"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
