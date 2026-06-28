import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Circle, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { ProposedTask } from "@/lib/tasks/client";

const priorityDot: Record<ProposedTask["priority"], string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
};

export function TaskProposalArtifact({ tasks }: { tasks: ProposedTask[] }) {
  const addTask = useDataStore((s) => s.addTask);
  const addNotification = useDataStore((s) => s.addNotification);
  const projects = useDataStore((s) => s.projects);
  const projectId = useSelectionStore((s) => s.projectId);
  const setActiveView = useShellStore((s) => s.setActiveView);
  const projectName = projects.find((p) => p.id === projectId)?.name ?? "the board";

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(tasks.map((_, index) => index)),
  );
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCount = selected.size;
  const validTasks = useMemo(() => tasks ?? [], [tasks]);

  const toggle = (index: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const addToBoard = async () => {
    if (!projectId) {
      toast.error("Select a project first.");
      return;
    }
    const chosen = validTasks.filter((_, index) => selected.has(index));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const created = [];
      for (const task of chosen) {
        const saved = await addTask({
          projectId,
          title: task.title,
          status: task.status,
          description: task.description || undefined,
          priority: task.priority,
          assignee: task.assignee || undefined,
          dueDate: task.dueDate || undefined,
        });
        created.push(saved);
        // Notify the assignee (or the team) for each task.
        const owner = task.assignee || projectName;
        addNotification({
          type: "task_assigned",
          title: `${saved.identifier} · ${task.title}`,
          body: `Assigned to ${owner} on ${projectName}.`,
          projectId,
          taskId: saved.id,
          actor: "Dexter",
        });
      }
      // Create a brief for the flow and link it to the first task.
      const first = created[0];
      if (first) {
        addNotification({
          type: "brief_created",
          title: `Brief ready — linked to ${first.identifier}`,
          body: chosen.map((task) => `• ${task.title}`).join("\n"),
          projectId,
          taskId: first.id,
          actor: "Dexter",
        });
      }
      addNotification({
        type: "flow_submitted",
        title: `${chosen.length} task${chosen.length === 1 ? "" : "s"} submitted to ${projectName}`,
        body: `The flow is on the ${projectName} board.`,
        projectId,
        actor: "Dexter",
      });
      setAdded(true);
      toast.success(`${chosen.length} task${chosen.length === 1 ? "" : "s"} added to ${projectName}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[min(40rem,90%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <ListTodo className="size-4" />
        </span>
        <span className="text-sm font-medium">
          {added ? "Tasks added to board" : "Proposed tasks"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {added ? `${selectedCount} added` : `${validTasks.length} suggested`}
        </span>
      </div>

      <div className="flex flex-col">
        {validTasks.map((task, index) => {
          const isSelected = selected.has(index);
          return (
            <button
              key={`${task.title}-${index}`}
              type="button"
              disabled={added}
              onClick={() => toggle(index)}
              className={cn(
                "flex items-start gap-2.5 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0",
                added ? "opacity-90" : "hover:bg-muted/40",
                !isSelected && !added && "opacity-50",
              )}
            >
              <span className="mt-0.5 shrink-0 text-active">
                {isSelected ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cn("size-1.5 shrink-0 rounded-full", priorityDot[task.priority])} />
                  <span className="truncate text-sm font-medium text-foreground">{task.title}</span>
                </span>
                {task.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{task.description}</span>
                ) : null}
                {(task.assignee || task.dueDate) && (
                  <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    {task.assignee ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5">@{task.assignee}</span>
                    ) : null}
                    {task.dueDate ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5">due {task.dueDate}</span>
                    ) : null}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
        {added ? (
          <Button size="sm" variant="outline" onClick={() => setActiveView("board")}>
            View board
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button size="sm" disabled={selectedCount === 0 || busy} onClick={() => void addToBoard()}>
            {busy ? "Adding…" : `Add ${selectedCount} to board`}
          </Button>
        )}
      </div>
    </div>
  );
}
