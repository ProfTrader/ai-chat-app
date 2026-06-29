import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { ChatActivity } from "@/lib/chat/chat-session-provider";

/**
 * Cursor-style status pills — surfaces what the agent is actually doing right
 * now (running tools / last completed step) plus any queued messages. Renders
 * nothing when idle so the composer stays clean.
 */
export function ComposerStatus({
  activities,
  queued,
  busy,
}: {
  activities: ChatActivity[];
  queued: number;
  busy: boolean;
}) {
  const running = activities.filter((activity) => activity.status === "running");
  const latestComplete = activities.filter((activity) => activity.status === "complete").slice(-1);
  const pills = running.length > 0 ? running : busy ? latestComplete : [];

  if (pills.length === 0 && queued === 0 && !busy) return null;

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1 px-1">
      {pills.map((activity) => (
        <span
          key={activity.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
          title={activity.detail || activity.label}
        >
          {activity.status === "running" ? (
            <Spinner aria-hidden="true" className="size-3 text-active" />
          ) : (
            <Check className="size-3 text-active" />
          )}
          <span className="max-w-[18rem] truncate">{activity.label}</span>
        </span>
      ))}
      {busy && pills.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          <Spinner aria-hidden="true" className="size-3 text-active" />
          Working…
        </span>
      ) : null}
      {queued > 0 ? (
        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          {queued} queued
        </span>
      ) : null}
    </div>
  );
}
