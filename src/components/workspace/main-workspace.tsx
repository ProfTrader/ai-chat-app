import { FolderKanban, MessageSquare, ListTodo, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatSessionProvider } from "@/lib/chat/chat-session-provider";
import { ChatThread } from "@/components/workspace/chat-thread";
import { ContactList } from "@/components/workspace/contact-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { TaskList } from "@/components/workspace/task-list";
import { KanbanBoard } from "@/components/workspace/kanban-board";
import { ChatComposer } from "@/components/composer/chat-composer";
import { useShellStore } from "@/stores/shell-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import type { ViewType } from "@/types";

const viewTabs: { value: ViewType; label: string; icon: typeof MessageSquare }[] = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "tasks", label: "Tasks", icon: ListTodo },
  { value: "board", label: "Board", icon: FolderKanban },
  { value: "contacts", label: "Contacts", icon: Users },
];

export function MainWorkspace() {
  const { activeView, setActiveView } = useShellStore();
  const { sessionId, projectId } = useSelectionStore();
  const { composerMode } = useChatStore();
  const { sessions, projects } = useDataStore();

  const session = sessions.find((s) => s.id === sessionId);
  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-pane">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium">
            {session?.title ?? project?.name ?? "Workspace"}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {project?.name ?? "Select a project"}
            {session ? ` · ${session.title}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as ViewType)}>
            <TabsList variant="line">
              {viewTabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}>
                  <Icon />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Separator />

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {activeView === "chat" && (
          <ChatSessionProvider sessionId={sessionId}>
            {sessionId ? <ChatThread /> : <EmptyState />}
            <ChatComposer />
          </ChatSessionProvider>
        )}
        {activeView === "tasks" && <TaskList />}
        {activeView === "board" && <KanbanBoard />}
        {activeView === "contacts" && <ContactList />}
      </div>
    </div>
  );
}
