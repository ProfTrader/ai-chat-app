import { TitleBar } from "@/components/layout/icon-rail";
import { StatusBar } from "@/components/layout/status-bar";
import { NavSidebar } from "@/components/sidebar/nav-sidebar";
import { MainWorkspace } from "@/components/workspace/main-workspace";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { navCollapsed, inspectorCollapsed } = useShellStore();

  const gridTemplateColumns = [
    !navCollapsed ? "260px" : null,
    "minmax(0, 1fr)",
    !inspectorCollapsed ? "300px" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div
        className="grid h-full min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns }}
      >
          {!navCollapsed && (
            <section
              aria-label="Navigation"
              className="min-h-0 min-w-0 overflow-hidden border-r border-border"
            >
              <NavSidebar />
            </section>
          )}

          <section
            aria-label="Workspace"
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <MainWorkspace />
          </section>

          {!inspectorCollapsed && (
            <section
              aria-label="Inspector"
              className={cn("min-h-0 min-w-0 overflow-hidden border-l border-border")}
            >
              <InspectorPanel />
            </section>
          )}
      </div>
      <StatusBar />
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  );
}
