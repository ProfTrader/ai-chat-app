import {
  FolderKanban,
  Inbox,
  PanelLeft,
  PanelRight,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

export function IconRail() {
  const { toggleNav, toggleInspector, setCommandOpen } = useShellStore();

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
      <div className="flex flex-col items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          title="New session"
        >
          <SquarePen />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={() => setCommandOpen(true)}
          title="Search (Ctrl+K)"
        >
          <Search />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          title="Inbox"
        >
          <Inbox />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          title="Projects"
        >
          <FolderKanban />
        </Button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <Separator className="mb-1 w-8" />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          title="Settings"
        >
          <Settings />
        </Button>
      </div>

      <div className="absolute bottom-12 left-0 hidden">
        <Button variant="ghost" size="icon" onClick={toggleNav} title="Toggle sidebar">
          <PanelLeft />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleInspector} title="Toggle inspector">
          <PanelRight />
        </Button>
      </div>
    </aside>
  );
}

export function TitleBar() {
  const { toggleNav, toggleInspector, navCollapsed, inspectorCollapsed } =
    useShellStore();

  return (
    <header
      className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4"
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
        <span className="text-sm font-medium text-muted-foreground">Nexus CRM</span>
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
