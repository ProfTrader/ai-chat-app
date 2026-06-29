import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDataStore } from "@/stores/data-store";
import { CADENCE_LABEL, formatScheduleDate } from "@/lib/automation/client";

export function ScheduleArtifact({ planId }: { planId: string }) {
  const allSchedule = useDataStore((s) => s.scheduleEntries);
  const schedule = useMemo(
    () => allSchedule.filter((entry) => entry.planId === planId),
    [allSchedule, planId],
  );

  if (schedule.length === 0) return null;
  const recurring = schedule.filter((entry) => entry.cadence !== "once").length;

  return (
    <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <CalendarClock className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Schedule</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {schedule.length} step{schedule.length === 1 ? "" : "s"} · {recurring} recurring
          </span>
        </div>
      </div>

      <ul className="flex flex-col">
        {schedule.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm">{entry.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Starts {formatScheduleDate(entry.startDate)}
              </span>
            </div>
            <Badge variant="outline" className="shrink-0 font-normal">
              {CADENCE_LABEL[entry.cadence]}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
