import { useEffect, useMemo } from "react";
import { usePanelRef } from "react-resizable-panels";
import { NavSidebar } from "@/components/sidebar/nav-sidebar";
import { MainWorkspace } from "@/components/workspace/main-workspace";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { ProfileSheet } from "@/components/profile/profile-sheet";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useShellStore } from "@/stores/shell-store";

export function AppShell() {
  const {
    activeView,
    navCollapsed,
    inspectorCollapsed,
    navPanelSize,
    inspectorPanelSize,
    setNavPanelSize,
    setInspectorPanelSize,
  } = useShellStore();

  const navPanelRef = usePanelRef();
  const inspectorPanelRef = usePanelRef();

  const defaultLayout = useMemo(
    () => ({
      nav: navCollapsed ? 0 : navPanelSize,
      workspace:
        100 -
        (navCollapsed ? 0 : navPanelSize) -
        (inspectorCollapsed || activeView === "nodes" ? 0 : inspectorPanelSize),
      inspector: inspectorCollapsed || activeView === "nodes" ? 0 : inspectorPanelSize,
    }),
    [activeView, navCollapsed, inspectorCollapsed, navPanelSize, inspectorPanelSize],
  );

  useEffect(() => {
    const panel = navPanelRef.current;
    if (!panel) return;
    if (navCollapsed) panel.collapse();
    else panel.expand();
  }, [navCollapsed, navPanelRef]);

  useEffect(() => {
    const panel = inspectorPanelRef.current;
    if (!panel) return;
    if (inspectorCollapsed) panel.collapse();
    else panel.expand();
  }, [inspectorCollapsed, inspectorPanelRef]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-shell">
      <ResizablePanelGroup
        id="app-shell"
        orientation="horizontal"
        className="min-h-0 flex-1 bg-shell"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout) => {
          if (typeof layout.nav === "number" && layout.nav > 0) {
            setNavPanelSize(layout.nav);
          }
          if (typeof layout.inspector === "number" && layout.inspector > 0) {
            setInspectorPanelSize(layout.inspector);
          }
        }}
      >
        <ResizablePanel
          id="nav"
          panelRef={navPanelRef}
          collapsible
          collapsedSize="0%"
          defaultSize={`${navPanelSize}%`}
          minSize="18%"
          maxSize="35%"
          className="min-h-0 min-w-0"
        >
          <section
            aria-label="Navigation"
            aria-hidden={navCollapsed}
            className="h-full min-h-0 min-w-0 overflow-hidden border-r border-border bg-pane"
          >
            <NavSidebar />
          </section>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="workspace" minSize="30%" className="min-h-0 min-w-0">
          <section aria-label="Workspace" className="h-full min-h-0 min-w-0 overflow-hidden bg-pane">
            <MainWorkspace />
          </section>
        </ResizablePanel>

        {activeView !== "nodes" && (
          <>
            <ResizableHandle withHandle />

            <ResizablePanel
              id="inspector"
              panelRef={inspectorPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize={`${inspectorPanelSize}%`}
              minSize="20%"
              maxSize="40%"
              className="min-h-0 min-w-0"
            >
              <section
                aria-label="Inspector"
                aria-hidden={inspectorCollapsed}
                className="h-full min-h-0 min-w-0 overflow-hidden border-l border-border bg-pane"
              >
                <InspectorPanel />
              </section>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <CommandPalette />
      <ShortcutsDialog />
      <SettingsSheet />
      <ProfileSheet />
    </div>
  );
}
