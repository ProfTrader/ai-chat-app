import { PersonAvatar } from "@/components/ui/person-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";
import type { Task, TeamMember } from "@/types";

interface KanbanCardProps {
  task: Task;
  assignee?: TeamMember;
  isFiltered?: boolean;
}

export function KanbanCard({ task, assignee, isFiltered }: KanbanCardProps) {
  const { selectedTaskId, selectTask } = useSelectionStore();
  const isSelected = task.id === selectedTaskId;

  return (
    <button
      type="button"
      onClick={() => selectTask(task)}
      className={cn(
        "w-full text-left transition-opacity",
        isFiltered && "opacity-40",
      )}
    >
      <Card
        size="sm"
        className={cn(
          "cursor-pointer ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-pane)]",
          isSelected && "ring-2 ring-active",
        )}
      >
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <span className="font-mono">{task.identifier}</span>
            {task.sourceRunId ? (
              <Badge variant="secondary" className="font-normal">
                From brief
              </Badge>
            ) : null}
          </CardDescription>
          <CardTitle className="line-clamp-2">{task.title}</CardTitle>
        </CardHeader>
        {(assignee || task.priority || task.dueDate) && (
          <CardFooter className="flex items-center justify-between gap-2">
            {assignee ? (
              <div className="flex min-w-0 items-center gap-2">
                <PersonAvatar
                  name={assignee.name}
                  avatarUrl={assignee.avatarUrl}
                  status={assignee.status}
                  size="sm"
                  shape="square"
                />
                <span className="truncate text-xs text-muted-foreground">
                  {assignee.name}
                </span>
              </div>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {task.priority && (
                <Badge variant="secondary" className="capitalize">
                  {task.priority}
                </Badge>
              )}
              {task.dueDate && (
                <span className="text-xs text-muted-foreground">{task.dueDate}</span>
              )}
            </div>
          </CardFooter>
        )}
      </Card>
    </button>
  );
}
