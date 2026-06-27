import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { AgentBrainPanel } from "@/components/inspector/agent-brain-panel";
import { UserPanel } from "@/components/inspector/user-panel";
import { findMemberByAssignee } from "@/lib/team-utils";
import { presenceLabels } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { TaskStatus } from "@/types";
import { ChevronRight } from "lucide-react";

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

export function InspectorPanel() {
  const { selectedTaskId, selectedContactId, selectedMemberId, projectId, selectMember } =
    useSelectionStore();
  const { tasks, contacts, updateTaskStatus, getTeamMembersByProject } = useDataStore();
  const setInspectorCollapsed = useShellStore((state) => state.setInspectorCollapsed);

  const task = tasks.find((t) => t.id === selectedTaskId);
  const contact = contacts.find((c) => c.id === selectedContactId);
  const members = getTeamMembersByProject(projectId);
  const member = members.find((m) => m.id === selectedMemberId);

  if (task) {
    const assigneeMember = findMemberByAssignee(members, task.assignee);

    return (
      <div className="flex h-full flex-col bg-pane">
        <div className="border-b border-border px-5 py-4">
          <p className="font-mono text-sm text-muted-foreground">{task.identifier}</p>
          <h2 className="mt-1.5 text-base font-medium leading-snug">{task.title}</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{statusLabels[task.status]}</Badge>
              {task.priority && (
                <Badge variant="secondary">{task.priority} priority</Badge>
              )}
              {task.dueDate && <Badge variant="secondary">Due {task.dueDate}</Badge>}
            </div>

            {task.description && (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Description
                </p>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {task.description}
                </p>
              </div>
            )}

            {task.assignee && (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Assignee
                </p>
                <button
                  type="button"
                  onClick={() => assigneeMember && selectMember(assigneeMember)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg transition-colors",
                    assigneeMember && "hover:bg-muted",
                  )}
                >
                  <PersonAvatar
                    name={assigneeMember?.name ?? task.assignee}
                    avatarUrl={assigneeMember?.avatarUrl}
                    status={assigneeMember?.status}
                    size="sm"
                    shape="square"
                  />
                  <span className="text-base">{task.assignee}</span>
                </button>
              </div>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Status
              </p>
              {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                <Button
                  key={status}
                  variant={task.status === status ? "secondary" : "ghost"}
                  size="default"
                  className="justify-start"
                  onClick={() => void updateTaskStatus(task.id, status)}
                >
                  {statusLabels[status]}
                </Button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (contact) {
    return (
      <div className="flex h-full flex-col bg-pane">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <PersonAvatar
              name={contact.name}
              avatarUrl={contact.avatarUrl}
              status={contact.status}
              size="lg"
              shape="square"
              imageSize={128}
              className="size-12"
            />
            <div className="min-w-0">
              <h2 className="truncate text-base font-medium">{contact.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{contact.company}</p>
              {contact.status ? (
                <Badge variant="secondary" className="mt-1.5">
                  {presenceLabels[contact.status]}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-5 p-5">
            {contact.email && (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Email
                </p>
                <p className="text-base">{contact.email}</p>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Last activity
              </p>
              <p className="text-base text-muted-foreground">{contact.lastActivity}</p>
            </div>
            {contact.notes && (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Notes
                </p>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {contact.notes}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (member) {
    return <UserPanel member={member} />;
  }

  return (
    <div className="flex h-full flex-col bg-pane">
      <Tabs defaultValue="agent" className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 pt-3">
          <TabsList variant="line" className="min-w-0 flex-1">
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="assignees">Assignees</TabsTrigger>
            <TabsTrigger value="labels">Labels</TabsTrigger>
            <TabsTrigger value="priority">Priority</TabsTrigger>
          </TabsList>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mb-1 text-muted-foreground"
                  aria-label="Hide inspector"
                  onClick={() => setInspectorCollapsed(true)}
                />
              }
            >
              <ChevronRight />
            </TooltipTrigger>
            <TooltipContent>Hide inspector</TooltipContent>
          </Tooltip>
        </div>
        <TabsContent value="agent" className="min-h-0 flex-1 p-0">
          <AgentBrainPanel />
        </TabsContent>
        <TabsContent value="assignees" className="flex-1 p-5">
          {members.length === 0 ? (
            <>
              <p className="text-base text-muted-foreground">No team members</p>
              <p className="mt-1.5 text-sm text-muted-foreground/70">
                Select a task or board card to view details here.
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Team
              </p>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMember(m)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <PersonAvatar
                    name={m.name}
                    avatarUrl={m.avatarUrl}
                    status={m.status}
                    shape="square"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="labels" className="flex-1 p-5">
          <p className="text-base text-muted-foreground">No labels applied</p>
        </TabsContent>
        <TabsContent value="priority" className="flex-1 p-5">
          <p className="text-base text-muted-foreground">All priorities</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
