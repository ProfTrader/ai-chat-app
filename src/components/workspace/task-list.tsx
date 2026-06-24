import { useMemo } from "react";
import { Circle, CircleCheck, CircleDashed, ListTodo } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { findMemberByAssignee } from "@/lib/team-utils";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { PresenceStatus, Task, TaskStatus } from "@/types";

const statusConfig: Record<
  TaskStatus,
  { label: string; icon: typeof Circle }
> = {
  todo: { label: "Todo", icon: Circle },
  in_progress: { label: "In Progress", icon: CircleDashed },
  done: { label: "Done", icon: CircleCheck },
};

function TaskRow({
  task,
  isSelected,
  assigneeName,
  assigneeAvatarUrl,
  assigneeStatus,
}: {
  task: Task;
  isSelected: boolean;
  assigneeName?: string;
  assigneeAvatarUrl?: string;
  assigneeStatus?: PresenceStatus;
}) {
  const selectTask = useSelectionStore((s) => s.selectTask);
  const StatusIcon = statusConfig[task.status].icon;

  return (
    <button
      type="button"
      onClick={() => selectTask(task)}
      className={cn(
        "group flex w-full items-center gap-3 border-b border-border/50 px-5 py-3 text-left transition-colors",
        isSelected ? "bg-active-soft" : "hover:bg-muted",
      )}
    >
      <StatusIcon
        className={cn(
          "size-5 shrink-0",
          task.status === "done" && "text-success",
          task.status === "in_progress" && "text-warning",
          task.status === "todo" && "text-muted-foreground",
        )}
      />
      <span className="shrink-0 font-mono text-sm text-muted-foreground">
        {task.identifier}
      </span>
      <span className="min-w-0 flex-1 truncate text-base">{task.title}</span>
      {assigneeName && task.assignee ? (
        <PersonAvatar
          name={assigneeName}
          avatarUrl={assigneeAvatarUrl}
          status={assigneeStatus}
          size="sm"
          shape="square"
          className="shrink-0"
        />
      ) : null}
      <Badge variant="outline" className="font-normal capitalize">
        {task.status.replace("_", " ")}
      </Badge>
      {task.dueDate && (
        <span className="shrink-0 text-sm text-muted-foreground">{task.dueDate}</span>
      )}
    </button>
  );
}

export function TaskList() {
  const { projectId, selectedTaskId } = useSelectionStore();
  const getTasksByProject = useDataStore((s) => s.getTasksByProject);
  const getTeamMembersByProject = useDataStore((s) => s.getTeamMembersByProject);
  const tasks = getTasksByProject(projectId);
  const members = getTeamMembersByProject(projectId);

  const grouped = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const task of tasks) {
      groups[task.status].push(task);
    }
    return groups;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 pb-32">
        <Empty className="max-w-md border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodo />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              Tasks for this project will show up here with status badges and due dates.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-32">
        {(Object.keys(statusConfig) as TaskStatus[]).map((status) => {
          const items = grouped[status];
          if (items.length === 0) return null;
          const { label } = statusConfig[status];
          return (
            <section key={status}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-pane px-5 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <span className="text-sm text-muted-foreground/60">{items.length}</span>
              </div>
              {items.map((task) => {
                const assignee = findMemberByAssignee(members, task.assignee);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    assigneeName={assignee?.name ?? task.assignee}
                    assigneeAvatarUrl={assignee?.avatarUrl}
                    assigneeStatus={assignee?.status}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
