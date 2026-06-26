import { useEffect } from "react";
import { useShellStore } from "@/stores/shell-store";
import type { ViewType } from "@/types";

export function useKeyboardShortcuts() {
  const {
    setCommandOpen,
    setShortcutsOpen,
    toggleNav,
    toggleInspector,
    setActiveView,
  } = useShellStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleNav();
        return;
      }

      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleInspector();
        return;
      }

      if (mod && ["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
        e.preventDefault();
        const views: ViewType[] = ["chat", "briefs", "tasks", "board", "contacts", "timeline", "nodes"];
        setActiveView(views[Number(e.key) - 1]);
        return;
      }

      if (e.key === "?" && !mod) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    setCommandOpen,
    setShortcutsOpen,
    toggleNav,
    toggleInspector,
    setActiveView,
  ]);
}
