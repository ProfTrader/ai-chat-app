import { CheckCircle2, ClipboardList, PencilLine, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlanIntakeCardProps {
  question: string;
  choices: string[];
  ready: boolean;
  progress: {
    current: number;
    total: number;
  };
  busy?: boolean;
  onChoose: (choice: string) => void;
  onGenerate: () => void;
  onSkip: () => void;
  onFocusComposer: () => void;
}

export function PlanIntakeCard({
  question,
  choices,
  ready,
  progress,
  busy = false,
  onChoose,
  onGenerate,
  onSkip,
  onFocusComposer,
}: PlanIntakeCardProps) {
  const percent = Math.min(100, Math.max(0, (progress.current / progress.total) * 100));

  return (
    <div className="mb-2 overflow-hidden rounded-[1.15rem] border border-border bg-composer/95 shadow-[0_20px_52px_-32px_oklch(0_0_0/0.9)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-active-soft text-active">
            <ClipboardList className="size-3.5" />
          </span>
          <span>Plan mode</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {ready ? "Ready" : `${progress.current} / ${progress.total}`}
          </span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-active transition-[width]"
              style={{ width: `${ready ? 100 : percent}%` }}
            />
          </span>
        </div>
      </div>

      <div className="p-3">
        {ready ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-active" />
              <p className="text-sm font-medium leading-5 text-foreground">
                Ready to draft the plan from this intake.
              </p>
            </div>
            <Button size="sm" disabled={busy} onClick={onGenerate} className="shrink-0">
              <ClipboardList data-icon="inline-start" />
              {busy ? "Drafting..." : "Generate plan"}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium leading-5 text-foreground">{question}</p>
            {choices.length > 0 ? (
              <div className="mt-3 grid gap-1.5">
                {choices.map((choice, index) => (
                  <button
                    key={`${choice}-${index}`}
                    type="button"
                    onClick={() => onChoose(choice)}
                    className="group flex min-h-10 w-full items-center gap-2 rounded-lg border border-border bg-background/45 px-2.5 py-2 text-left text-sm transition-colors hover:border-active/50 hover:bg-active-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground group-hover:bg-active group-hover:text-active-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-5 text-foreground">{choice}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
              <button
                type="button"
                onClick={onFocusComposer}
                className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PencilLine className="size-3.5 shrink-0" />
                <span className="truncate">Something else</span>
              </button>
              <Button size="sm" variant="ghost" onClick={onSkip}>
                <SkipForward data-icon="inline-start" />
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
