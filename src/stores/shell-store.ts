import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewType } from "@/types";

export type SidebarMode = "inbox" | "projects";

interface ShellState {
  navCollapsed: boolean;
  inspectorCollapsed: boolean;
  sidebarMode: SidebarMode;
  activeView: ViewType;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  setNavCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleNav: () => void;
  toggleInspector: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setActiveView: (view: ViewType) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
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
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setActiveView: (activeView) => set({ activeView }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: "crm-shell",
      partialize: (state) => ({
        navCollapsed: state.navCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
        sidebarMode: state.sidebarMode,
        activeView: state.activeView,
      }),
    },
  ),
);
