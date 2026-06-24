import { PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const { toggleNav, toggleInspector, navCollapsed, inspectorCollapsed } =
    useShellStore();

  return (
    <header
      className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-pane px-4"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("text-muted-foreground", navCollapsed && "bg-muted")}
          onClick={toggleNav}
          title="Toggle navigation"
        >
          <PanelLeft />
        </Button>
        <span className="text-sm font-medium text-foreground/80">Nexus CRM</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("text-muted-foreground", inspectorCollapsed && "bg-muted")}
          onClick={toggleInspector}
          title="Toggle inspector"
        >
          <PanelRight />
        </Button>
      </div>
    </header>
  );
}
