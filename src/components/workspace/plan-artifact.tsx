import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Hammer,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import { appendAgentNote } from "@/lib/agent-files/client";
import type { PlanStep, PlanStepTier } from "@/lib/plan/client";

const TIERS: PlanStepTier[] = ["automatic", "strict", "approval"];

const tierBadgeClass: Record<PlanStepTier, string> = {
  automatic: "",
  strict: "border-warning/30 text-warning",
  approval: "border-destructive/30 text-destructive",
};

function newStep(): PlanStep {
  return { id: crypto.randomUUID().slice(0, 8), action: "", tier: "automatic", done: false };
}

export function PlanArtifact({ planId }: { planId: string }) {
  const plan = useDataStore((s) => s.plans.find((p) => p.id === planId));
  const updatePlan = useDataStore((s) => s.updatePlan);
  const setPlanStatus = useDataStore((s) => s.setPlanStatus);
  const recordAgentMemory = useDataStore((s) => s.recordAgentMemory);
  const fallbackProjectId = useSelectionStore((s) => s.projectId);
  const { buildPlan } = useChatSession();
  const [busy, setBusy] = useState(false);

  if (!plan) return null;
  const editable = plan.status === "draft";

  const commitSteps = (steps: PlanStep[]) => updatePlan(plan.id, { steps });
  const updateStep = (id: string, patch: Partial<PlanStep>) =>
    commitSteps(plan.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  const removeStep = (id: string) =>
    commitSteps(plan.steps.filter((step) => step.id !== id));
  const addStep = () => commitSteps([...plan.steps, newStep()]);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= plan.steps.length) return;
    const next = [...plan.steps];
    [next[index], next[target]] = [next[target], next[index]];
    commitSteps(next);
  };

  const build = async () => {
    setBusy(true);
    try {
      await buildPlan(plan.id);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setPlanStatus(plan.id, "discarded");
    const projectId = plan.projectId ?? fallbackProjectId;
    if (!projectId) return;
    const signal = `The user dismissed "${plan.title}". For similar planning requests, ask a sharper intake question before drafting and avoid assuming this structure is acceptable.`;
    recordAgentMemory({
      projectId,
      title: "Planning preference - dismissed draft",
      body: signal,
      kind: "preference",
      source: "user",
      confidence: 0.75,
      pinned: false,
    });
    void appendAgentNote("memory.md", "Planning preference - dismissed draft", signal);
  };

  return (
    <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <ClipboardList className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {editable ? (
            <input
              defaultValue={plan.title}
              onBlur={(event) => updatePlan(plan.id, { title: event.target.value.trim() || plan.title })}
              className="w-full truncate border-0 bg-transparent text-sm font-medium text-foreground outline-none focus-visible:ring-0"
              aria-label="Plan title"
            />
          ) : (
            <span className="truncate text-sm font-medium">{plan.title}</span>
          )}
          <span className="truncate text-[11px] text-muted-foreground">
            {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · editable plan
          </span>
        </div>
        {plan.status === "approved" ? (
          <Badge variant="secondary" className="font-normal">
            <Check data-icon="inline-start" />
            Built
          </Badge>
        ) : plan.status === "discarded" ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Discarded
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal">
            Draft
          </Badge>
        )}
      </div>

      {plan.summary ? (
        <p className="border-b border-border px-4 py-2.5 text-xs leading-5 text-muted-foreground">
          {plan.summary}
        </p>
      ) : null}

      <ol className="flex flex-col">
        {plan.steps.map((step, index) => (
          <li
            key={step.id}
            className="group/step flex items-start gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => editable && updateStep(step.id, { done: !step.done })}
              disabled={!editable}
              aria-label={step.done ? "Mark step not done" : "Mark step done"}
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                step.done
                  ? "border-active bg-active text-active-foreground"
                  : "border-border text-transparent",
              )}
            >
              <Check className="size-3" />
            </button>

            <div className="min-w-0 flex-1">
              {editable ? (
                <input
                  defaultValue={step.action}
                  placeholder="Describe the step…"
                  onBlur={(event) => updateStep(step.id, { action: event.target.value })}
                  className={cn(
                    "w-full border-0 bg-transparent text-sm outline-none focus-visible:ring-0",
                    step.done && "text-muted-foreground line-through",
                  )}
                />
              ) : (
                <span className={cn("text-sm", step.done && "text-muted-foreground line-through")}>
                  {step.action}
                </span>
              )}
              {editable ? (
                <input
                  defaultValue={step.detail ?? ""}
                  placeholder="Add detail (optional)…"
                  onBlur={(event) =>
                    updateStep(step.id, { detail: event.target.value.trim() || undefined })
                  }
                  className="mt-0.5 w-full border-0 bg-transparent text-[11px] text-muted-foreground outline-none focus-visible:ring-0"
                />
              ) : step.detail ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{step.detail}</span>
              ) : null}
            </div>

            {editable ? (
              <Select
                value={step.tier}
                onValueChange={(value) =>
                  updateStep(step.id, { tier: (value as PlanStepTier) ?? "automatic" })
                }
              >
                <SelectTrigger size="sm" className={cn("h-6 shrink-0 capitalize", tierBadgeClass[step.tier])}>
                  <SelectValue>{(value) => String(value ?? step.tier)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier} className="capitalize">
                      {tier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={cn("shrink-0 font-normal capitalize", tierBadgeClass[step.tier])}>
                {step.tier}
              </Badge>
            )}

            {editable ? (
              <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/step:opacity-100 focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Move step up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Move step down"
                  disabled={index === plan.steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Remove step"
                  onClick={() => removeStep(step.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {editable ? (
        <button
          type="button"
          onClick={addStep}
          className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add step
        </button>
      ) : null}

      {plan.assumptions.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-[11px] leading-5 text-muted-foreground">
          Assumes: {plan.assumptions.join("; ")}
        </p>
      ) : null}

      {editable ? (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-3 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={busy}
            onClick={discard}
          >
            <X data-icon="inline-start" />
            Discard
          </Button>
          <Button size="sm" disabled={busy || plan.steps.length === 0} onClick={() => void build()}>
            <Hammer data-icon="inline-start" />
            {busy ? "Building…" : "Build plan"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
