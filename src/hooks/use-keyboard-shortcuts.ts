import { useEffect } from "react";
import { useShellStore } from "@/stores/shell-store";
import type { ViewType } from "@/types";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

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
      const editable = isEditableTarget(e.target);

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (editable) return;

      if (mod && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
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
