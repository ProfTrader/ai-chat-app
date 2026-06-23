import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { KanbanCard } from "@/components/workspace/kanban-card";
import { findMemberByAssignee } from "@/lib/team-utils";
import type { Task, TaskStatus, TeamMember } from "@/types";

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  members: TeamMember[];
  memberFilterId: string | null;
}

export function KanbanColumn({
  status,
  tasks,
  members,
  memberFilterId,
}: KanbanColumnProps) {
  const filteredMember = memberFilterId
    ? members.find((m) => m.id === memberFilterId)
    : undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-muted/30">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-sm font-medium">{statusLabels[status]}</span>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-3">
          {tasks.length === 0 ? (
            <Empty className="border border-dashed border-border bg-card/50 py-8">
              <EmptyHeader>
                <EmptyTitle className="text-sm">No tasks</EmptyTitle>
                <EmptyDescription className="text-xs">
                  Tasks moved to {statusLabels[status].toLowerCase()} appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            tasks.map((task) => {
              const assignee = findMemberByAssignee(members, task.assignee);
              const isFiltered =
                !!filteredMember &&
                task.assignee !== filteredMember.name;

              return (
                <KanbanCard
                  key={task.id}
                  task={task}
                  assignee={assignee}
                  isFiltered={isFiltered}
                />
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
