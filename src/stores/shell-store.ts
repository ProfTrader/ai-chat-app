import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewType } from "@/types";

interface ShellState {
  navCollapsed: boolean;
  inspectorCollapsed: boolean;
  activeView: ViewType;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  setNavCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleNav: () => void;
  toggleInspector: () => void;
  setActiveView: (view: ViewType) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      navCollapsed: false,
      inspectorCollapsed: false,
      activeView: "chat",
      commandOpen: false,
      shortcutsOpen: false,
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
      setActiveView: (activeView) => set({ activeView }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: "crm-shell",
      partialize: (state) => ({
        navCollapsed: state.navCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
        activeView: state.activeView,
      }),
    },
  ),
);
