import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { KanbanColumn } from "@/components/workspace/kanban-column";
import { TeamAvatarStrip } from "@/components/workspace/team-avatar-strip";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { TaskStatus } from "@/types";

const columnOrder: TaskStatus[] = ["todo", "in_progress", "done"];

export function KanbanBoard() {
  const { projectId, memberFilterId } = useSelectionStore();
  const getTasksByProject = useDataStore((s) => s.getTasksByProject);
  const getTeamMembersByProject = useDataStore((s) => s.getTeamMembersByProject);

  const tasks = getTasksByProject(projectId);
  const members = getTeamMembersByProject(projectId);

  const grouped = useMemo(() => {
    const groups: Record<TaskStatus, typeof tasks> = {
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
      <div className="flex h-full flex-col">
        <TeamAvatarStrip members={members} />
        <Separator />
        <div className="flex flex-1 items-center justify-center text-base text-muted-foreground">
          No tasks in this project yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TeamAvatarStrip members={members} />
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid min-h-[calc(100vh-12rem)] grid-cols-3 gap-4 px-5 py-4 pb-6">
          {columnOrder.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={grouped[status]}
              members={members}
              memberFilterId={memberFilterId}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
