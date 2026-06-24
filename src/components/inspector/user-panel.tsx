import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { presenceLabels } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { TaskStatus, TeamMember } from "@/types";

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

interface UserPanelProps {
  member: TeamMember;
}

export function UserPanel({ member }: UserPanelProps) {
  const { projectId } = useSelectionStore();
  const getTasksByProject = useDataStore((s) => s.getTasksByProject);
  const selectTask = useSelectionStore((s) => s.selectTask);
  const selectedTaskId = useSelectionStore((s) => s.selectedTaskId);

  const assignedTasks = useMemo(
    () =>
      getTasksByProject(projectId).filter((t) => t.assignee === member.name),
    [getTasksByProject, projectId, member.name],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
    };
    for (const task of assignedTasks) {
      counts[task.status]++;
    }
    return counts;
  }, [assignedTasks]);

  return (
    <div className="flex h-full flex-col bg-pane">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <PersonAvatar
            name={member.name}
            avatarUrl={member.avatarUrl}
            status={member.status}
            size="lg"
            shape="square"
            imageSize={128}
            className="size-12"
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium">{member.name}</h2>
            <p className="truncate text-sm text-muted-foreground">{member.role}</p>
            {member.status ? (
              <Badge variant="secondary" className="mt-1.5">
                {presenceLabels[member.status]}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-5">
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Email
            </p>
            <p className="text-base">{member.email}</p>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Task summary
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                <Badge key={status} variant="outline">
                  {statusLabels[status]}: {statusCounts[status]}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Assigned tasks
            </p>
            {assignedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks assigned.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {assignedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => selectTask(task)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted",
                      task.id === selectedTaskId && "bg-active-soft",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {task.identifier}
                    </span>
                    <span className="truncate text-sm">{task.title}</span>
                    <Badge variant="secondary" className="mt-1 w-fit capitalize">
                      {statusLabels[task.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
