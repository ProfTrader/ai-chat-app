import { useMemo } from "react";
import { Workflow, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { TIER_LABEL } from "@/lib/automation/client";
import type { PlanStepTier } from "@/lib/plan/client";

const tierBadgeClass: Record<PlanStepTier, string> = {
  automatic: "",
  strict: "border-warning/30 text-warning",
  approval: "border-destructive/30 text-destructive",
};

export function AutomationArtifact({ planId }: { planId: string }) {
  const allAutomations = useDataStore((s) => s.automations);
  const setAutomationStatus = useDataStore((s) => s.setAutomationStatus);
  const automations = useMemo(
    () => allAutomations.filter((rule) => rule.planId === planId),
    [allAutomations, planId],
  );

  if (automations.length === 0) return null;
  const activeCount = automations.filter((rule) => rule.status === "active").length;

  return (
    <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <Workflow className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Automations</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {automations.length} rule{automations.length === 1 ? "" : "s"} · {activeCount} active
          </span>
        </div>
      </div>

      <ul className="flex flex-col">
        {automations.map((rule) => {
          const paused = rule.status === "paused";
          return (
            <li
              key={rule.id}
              className="flex items-start gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md",
                  paused ? "bg-muted text-muted-foreground" : "bg-active-soft text-active",
                )}
              >
                <Zap className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", paused && "text-muted-foreground")}>
                  {rule.name}
                </span>
                <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                  {rule.trigger} <span className="text-active">→</span> {rule.action}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn("mt-0.5 shrink-0 font-normal", tierBadgeClass[rule.tier])}
              >
                {TIER_LABEL[rule.tier]}
              </Badge>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground"
                onClick={() => setAutomationStatus(rule.id, paused ? "active" : "paused")}
              >
                {paused ? "Resume" : "Pause"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
