import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useDataStore } from "@/stores/data-store";

export function App() {
  const initialize = useDataStore((s) => s.initialize);

  useKeyboardShortcuts();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return <AppShell />;
}
