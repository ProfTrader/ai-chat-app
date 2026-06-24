import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAuthStore } from "@/stores/auth-store";
import { useDataStore } from "@/stores/data-store";

export function App() {
  const initialize = useDataStore((s) => s.initialize);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);

  useKeyboardShortcuts();

  useEffect(() => {
    void initialize();
    void refreshStatus();
  }, [initialize, refreshStatus]);

  return <AppShell />;
}
