import { create } from "zustand";

export interface ConnectionStatus {
  isConnected: boolean;
  url: string;
  lastConnected?: Date;
  reconnectAttempts: number;
  latency?: number;
  sseConnected?: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "operator" | "viewer";
  provider?: "local" | "google";
  email?: string | null;
  avatar_url?: string | null;
}

export interface Session {
  id: string;
  key: string;
  active: boolean;
  model?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
}

export interface Activity {
  id: number;
  actor: string;
  description: string;
  created_at: number;
}

interface MissionControlStore {
  // Connection state
  connection: ConnectionStatus;
  setConnection: (connection: Partial<ConnectionStatus>) => void;

  // Auth
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;

  // UI State
  activeTab: string;
  sidebarExpanded: boolean;
  collapsedGroups: string[];
  liveFeedOpen: boolean;
  setActiveTab: (tab: string) => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleGroup: (groupId: string) => void;
  toggleLiveFeed: () => void;

  logs: LogEntry[];
  activities: Activity[];
  sessions: Session[];
}

export const useMissionControl = create<MissionControlStore>((set) => ({
  // Connection state
  connection: {
    isConnected: true, // Mocked as true for now
    url: "",
    reconnectAttempts: 0,
  },
  setConnection: (connection) =>
    set((state) => ({
      connection: { ...state.connection, ...connection },
    })),

  // Auth
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  // UI State — sidebar & layout persistence
  activeTab: "overview",
  sidebarExpanded: (() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("mc-sidebar-expanded") === "true";
    } catch {
      return false;
    }
  })(),
  collapsedGroups: (() => {
    if (typeof window === "undefined") return [] as string[];
    try {
      const raw = localStorage.getItem("mc-sidebar-groups");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [] as string[];
    }
  })(),
  liveFeedOpen: (() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("mc-livefeed-open") !== "false";
    } catch {
      return true;
    }
  })(),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarExpanded;
      try {
        localStorage.setItem("mc-sidebar-expanded", String(next));
      } catch {}
      return { sidebarExpanded: next };
    }),
  setSidebarExpanded: (expanded) => {
    try {
      localStorage.setItem("mc-sidebar-expanded", String(expanded));
    } catch {}
    set({ sidebarExpanded: expanded });
  },
  toggleGroup: (groupId) =>
    set((state) => {
      const next = state.collapsedGroups.includes(groupId)
        ? state.collapsedGroups.filter((g) => g !== groupId)
        : [...state.collapsedGroups, groupId];
      try {
        localStorage.setItem("mc-sidebar-groups", JSON.stringify(next));
      } catch {}
      return { collapsedGroups: next };
    }),
  toggleLiveFeed: () =>
    set((state) => {
      const next = !state.liveFeedOpen;
      try {
        localStorage.setItem("mc-livefeed-open", String(next));
      } catch {}
      return { liveFeedOpen: next };
    }),

  logs: [],
  activities: [],
  sessions: [],
}));
