import { CalendarDays, Columns3, ContactRound, Database, FileText, Inbox, ListTodo, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChatSessionProvider } from "@/lib/chat/chat-session-provider";
import { ChatThread } from "@/components/workspace/chat-thread";
import { ContactList } from "@/components/workspace/contact-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { TaskList } from "@/components/workspace/task-list";
import { KanbanBoard } from "@/components/workspace/kanban-board";
import { NodeManager } from "@/components/workspace/node-manager";
import { InboxWorkspace } from "@/components/workspace/inbox-workspace";
import { BriefsWorkspace } from "@/components/workspace/briefs-workspace";
import { TimelineWorkspace } from "@/components/workspace/timeline-workspace";
import { ChatComposer } from "@/components/composer/chat-composer";
import { useShellStore } from "@/stores/shell-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import type { ViewType } from "@/types";

const viewMeta: Record<ViewType, { label: string; icon: LucideIcon; description: string }> = {
  chat: {
    label: "Chat",
    icon: Inbox,
    description: "Project conversation and agent work thread",
  },
  briefs: {
    label: "Briefs",
    icon: FileText,
    description: "Project brief artifacts and delivery studio",
  },
  tasks: {
    label: "Tasks",
    icon: ListTodo,
    description: "Project actions, owners, and due dates",
  },
  board: {
    label: "Board",
    icon: Columns3,
    description: "Project work grouped by status",
  },
  contacts: {
    label: "Team",
    icon: ContactRound,
    description: "People and companies attached to this project",
  },
  timeline: {
    label: "Timeline",
    icon: CalendarDays,
    description: "Daily ledger and roadmap for project execution",
  },
  nodes: {
    label: "Agent builder",
    icon: Network,
    description: "Enterprise agent blueprint - internal workforce first",
  },
};

const projectViews: ViewType[] = ["chat", "briefs", "tasks", "board", "contacts"];

export function MainWorkspace() {
  const { activeView, sidebarMode } = useShellStore();
  const { sessionId, projectId } = useSelectionStore();
  const { composerMode } = useChatStore();
  const { sessions, projects, workRuns, tasks, storageBackend, getTeamMembersByProject } = useDataStore();

  const session = sessions.find((s) => s.id === sessionId);
  const project = projects.find((p) => p.id === projectId);
  const activeMeta = viewMeta[activeView];
  const ActiveIcon = activeMeta.icon;
  const projectScoped = projectViews.includes(activeView);
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const activeCount =
    activeView === "chat"
      ? sessions.filter((item) => item.projectId === projectId).length
      : activeView === "briefs"
        ? workRuns.filter((run) => run.projectId === projectId).length
      : activeView === "tasks"
        ? projectTasks.filter((task) => task.status !== "done").length
      : activeView === "board"
        ? projectTasks.length
      : activeView === "contacts"
        ? getTeamMembersByProject(projectId).length
      : undefined;
  const workspaceTitle =
    activeView === "chat" && sidebarMode === "inbox"
      ? "Inbox"
      : projectScoped
        ? project?.name ?? "Project"
        : activeMeta.label;
  const workspaceSubtitle =
    activeView === "chat" && sidebarMode === "inbox"
      ? "Cross-project conversations and incoming agent work"
      : projectScoped
        ? `${activeMeta.label}${session && activeView === "chat" ? ` - ${session.title}` : ""}`
        : activeMeta.description;
  const storageLabel =
    storageBackend === "indexeddb"
      ? "IndexedDB"
      : storageBackend === "sqlite"
        ? "SQLite"
        : storageBackend === "localstorage"
          ? "Local fallback"
          : "Memory";

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-shell">
      <div className="flex min-h-14 items-center justify-between border-b border-border bg-pane px-5 py-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{workspaceTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {workspaceSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
            <ActiveIcon data-icon="inline-start" />
            {activeMeta.label}
          </Badge>
          {typeof activeCount === "number" ? (
            <Badge variant="outline" className="hidden font-normal sm:inline-flex">
              {activeCount}
            </Badge>
          ) : null}
          <Badge variant="outline" className="hidden font-normal lg:inline-flex">
            <Database data-icon="inline-start" />
            {storageLabel}
          </Badge>
          {activeView === "chat" && (
            <Badge
              variant="outline"
              className={cn(
                "hidden font-normal sm:inline-flex",
                composerMode === "auto" && "border-fin/30 text-fin",
              )}
            >
              {composerMode === "plan" ? "Plan mode" : "Auto mode"}
            </Badge>
          )}
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {activeView === "chat" &&
          (sidebarMode === "inbox" ? (
            <InboxWorkspace />
          ) : (
            <ChatSessionProvider sessionId={sessionId}>
              {sessionId ? <ChatThread /> : <EmptyState />}
              <ChatComposer />
            </ChatSessionProvider>
          ))}
        {activeView === "briefs" && <BriefsWorkspace />}
        {activeView === "tasks" && <TaskList />}
        {activeView === "board" && <KanbanBoard />}
        {activeView === "contacts" && <ContactList />}
        {activeView === "timeline" && <TimelineWorkspace />}
        {activeView === "nodes" && <NodeManager />}
      </div>
    </div>
  );
}
