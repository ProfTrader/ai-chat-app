import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewType } from "@/types";

export type SidebarMode = "inbox" | "projects";

const NAV_PANEL_DEFAULT = 26;
const INSPECTOR_PANEL_DEFAULT = 30;
const NAV_PANEL_MIN = 18;
const INSPECTOR_PANEL_MIN = 20;

function normalizeNavPanelSize(size: unknown): number {
  if (typeof size !== "number" || Number.isNaN(size)) return NAV_PANEL_DEFAULT;
  return Math.min(35, Math.max(NAV_PANEL_MIN, size));
}

function normalizeInspectorPanelSize(size: unknown): number {
  if (typeof size !== "number" || Number.isNaN(size)) return INSPECTOR_PANEL_DEFAULT;
  return Math.min(40, Math.max(INSPECTOR_PANEL_MIN, size));
}

interface ShellState {
  navCollapsed: boolean;
  inspectorCollapsed: boolean;
  sidebarMode: SidebarMode;
  activeView: ViewType;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
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
      navPanelSize: NAV_PANEL_DEFAULT,
      inspectorPanelSize: INSPECTOR_PANEL_DEFAULT,
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setActiveView: (activeView) => set({ activeView }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
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
          navPanelSize: normalizeNavPanelSize(saved?.navPanelSize ?? current.navPanelSize),
          inspectorPanelSize: normalizeInspectorPanelSize(
            saved?.inspectorPanelSize ?? current.inspectorPanelSize,
          ),
        };
      },
      partialize: (state) => ({
        navCollapsed: state.navCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
        sidebarMode: state.sidebarMode,
        activeView: state.activeView,
        navPanelSize: state.navPanelSize,
        inspectorPanelSize: state.inspectorPanelSize,
      }),
    },
  ),
);
