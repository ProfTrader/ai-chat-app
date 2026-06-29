import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  keyword: string;
  icon: LucideIcon;
}

/**
 * Inline "/" command menu anchored above the composer input. Presentational —
 * the composer owns filtering/selection state and runs the chosen command.
 */
export function ComposerSlashMenu({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}) {
  if (commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-md">
      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Commands
      </p>
      {commands.map((command, index) => {
        const Icon = command.icon;
        return (
          <button
            key={command.id}
            type="button"
            // mousedown (not click) so the textarea doesn't blur before we run.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
              index === activeIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{command.label}</span>
              <span className="truncate text-[11px] text-muted-foreground">{command.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
