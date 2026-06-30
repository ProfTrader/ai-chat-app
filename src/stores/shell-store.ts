import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewType } from "@/types";

export type SidebarMode = "chat" | "inbox" | "projects";

const viewTypes = new Set<ViewType>([
  "chat",
  "briefs",
  "tasks",
  "contacts",
  "board",
  "timeline",
  "nodes",
]);
const sidebarModes = new Set<SidebarMode>(["chat", "inbox", "projects"]);

const NAV_PANEL_DEFAULT = 33;
const INSPECTOR_PANEL_DEFAULT = 30;
const NAV_PANEL_MIN = 18;
const INSPECTOR_PANEL_MIN = 20;

function normalizeNavPanelSize(size: unknown): number {
  if (typeof size !== "number" || Number.isNaN(size)) return NAV_PANEL_DEFAULT;
  return Math.min(40, Math.max(NAV_PANEL_MIN, size));
}

function normalizeInspectorPanelSize(size: unknown): number {
  if (typeof size !== "number" || Number.isNaN(size)) return INSPECTOR_PANEL_DEFAULT;
  return Math.min(40, Math.max(INSPECTOR_PANEL_MIN, size));
}

function normalizeViewType(view: unknown): ViewType {
  return typeof view === "string" && viewTypes.has(view as ViewType) ? (view as ViewType) : "chat";
}

function normalizeSidebarMode(mode: unknown): SidebarMode {
  return typeof mode === "string" && sidebarModes.has(mode as SidebarMode)
    ? (mode as SidebarMode)
    : "projects";
}

interface ShellState {
  navCollapsed: boolean;
  inspectorCollapsed: boolean;
  sidebarMode: SidebarMode;
  activeView: ViewType;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  profileOpen: boolean;
  agentWorking: boolean;
  notificationsInitializedAt: string | null;
  notificationReadAt: Record<string, string>;
  navPanelSize: number;
  inspectorPanelSize: number;
  setNavCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleNav: () => void;
  toggleInspector: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setActiveView: (view: ViewType) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  setAgentWorking: (working: boolean) => void;
  initializeNotifications: (at: string) => void;
  markNotificationRead: (key: string, at?: string) => void;
  markNotificationReads: (keys: string[], at?: string) => void;
  setNavPanelSize: (size: number) => void;
  setInspectorPanelSize: (size: number) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      navCollapsed: false,
      inspectorCollapsed: false,
      sidebarMode: "projects",
      activeView: "chat",
      commandOpen: false,
      shortcutsOpen: false,
      settingsOpen: false,
      profileOpen: false,
      agentWorking: false,
      notificationsInitializedAt: null,
      notificationReadAt: {},
      navPanelSize: NAV_PANEL_DEFAULT,
      inspectorPanelSize: INSPECTOR_PANEL_DEFAULT,
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
      setSidebarMode: (sidebarMode) => set({ sidebarMode: normalizeSidebarMode(sidebarMode) }),
      setActiveView: (activeView) => set({ activeView: normalizeViewType(activeView) }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setProfileOpen: (profileOpen) => set({ profileOpen }),
      setAgentWorking: (agentWorking) => set({ agentWorking }),
      initializeNotifications: (at) =>
        set((state) =>
          state.notificationsInitializedAt
            ? state
            : {
                notificationsInitializedAt: at,
                notificationReadAt: state.notificationReadAt,
              },
        ),
      markNotificationRead: (key, at = new Date().toISOString()) =>
        set((state) => ({
          notificationReadAt: {
            ...state.notificationReadAt,
            [key]: at,
          },
        })),
      markNotificationReads: (keys, at = new Date().toISOString()) =>
        set((state) => {
          if (keys.length === 0) return state;
          const nextReadAt = { ...state.notificationReadAt };
          keys.forEach((key) => {
            nextReadAt[key] = at;
          });
          return { notificationReadAt: nextReadAt };
        }),
      setNavPanelSize: (navPanelSize) => set({ navPanelSize: normalizeNavPanelSize(navPanelSize) }),
      setInspectorPanelSize: (inspectorPanelSize) =>
        set({ inspectorPanelSize: normalizeInspectorPanelSize(inspectorPanelSize) }),
    }),
    {
      name: "crm-shell",
      merge: (persisted, current) => {
        const saved = persisted as Partial<ShellState> | undefined;
        return {
          ...current,
          ...saved,
          notificationReadAt: saved?.notificationReadAt ?? current.notificationReadAt,
          notificationsInitializedAt:
            saved?.notificationsInitializedAt ?? current.notificationsInitializedAt,
          navPanelSize: normalizeNavPanelSize(saved?.navPanelSize ?? current.navPanelSize),
          inspectorPanelSize: normalizeInspectorPanelSize(
            saved?.inspectorPanelSize ?? current.inspectorPanelSize,
          ),
          activeView: normalizeViewType(saved?.activeView ?? current.activeView),
          sidebarMode: normalizeSidebarMode(saved?.sidebarMode ?? current.sidebarMode),
        };
      },
      partialize: (state) => ({
        navCollapsed: state.navCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
        sidebarMode: state.sidebarMode,
        activeView: state.activeView,
        notificationReadAt: state.notificationReadAt,
        notificationsInitializedAt: state.notificationsInitializedAt,
        navPanelSize: state.navPanelSize,
        inspectorPanelSize: state.inspectorPanelSize,
      }),
    },
  ),
);
