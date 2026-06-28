import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAuthStore } from "@/stores/auth-store";
import { useDataStore } from "@/stores/data-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

export function App() {
  const initialize = useDataStore((s) => s.initialize);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const onboarded = useOnboardingStore((s) => s.completed);

  useKeyboardShortcuts();

  useEffect(() => {
    void initialize();
    void refreshStatus();
  }, [initialize, refreshStatus]);

  return (
    <>
      <AppShell />
      {!onboarded && <OnboardingFlow />}
    </>
  );
}
