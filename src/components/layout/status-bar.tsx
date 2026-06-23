import { Activity, Bot, Clock } from "lucide-react";

export function StatusBar() {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-sidebar px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Activity className="size-4 text-success" />
          Gateway ready
        </span>
        <span className="flex items-center gap-1.5">
          <Bot className="size-4" />
          Agents
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />
          Cron
        </span>
      </div>
      <span className="font-mono text-xs">v0.1.0 · local</span>
    </footer>
  );
}
