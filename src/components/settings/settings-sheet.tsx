import { useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { CursorAuthPanel } from "@/components/settings/cursor-auth-panel";
import { OpenAiAuthPanel } from "@/components/settings/openai-auth-panel";
import { useAuthStore } from "@/stores/auth-store";
import { useShellStore } from "@/stores/shell-store";

export function SettingsSheet() {
  const settingsOpen = useShellStore((s) => s.settingsOpen);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const loadModels = useAuthStore((s) => s.loadModels);

  useEffect(() => {
    if (!settingsOpen) return;
    void refreshStatus().then(() => {
      const connected = useAuthStore.getState().status?.connected;
      if (connected) void loadModels();
    });
  }, [settingsOpen, refreshStatus, loadModels]);

  return (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Connect Cursor, choose a model, and manage your assistant account.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Account</h3>
            <CursorAuthPanel />
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Providers</h3>
            <OpenAiAuthPanel />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
