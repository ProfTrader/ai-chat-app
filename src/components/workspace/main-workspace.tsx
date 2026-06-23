import { FolderKanban, MessageSquare, ListTodo, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatThread } from "@/components/workspace/chat-thread";
import { ContactList } from "@/components/workspace/contact-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { TaskList } from "@/components/workspace/task-list";
import { KanbanBoard } from "@/components/workspace/kanban-board";
import { ChatComposer } from "@/components/composer/chat-composer";
import { useShellStore } from "@/stores/shell-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
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
  const { sessions, projects } = useDataStore();

  const session = sessions.find((s) => s.id === sessionId);
  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium">
            {session?.title ?? project?.name ?? "Workspace"}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {project?.name ?? "Select a project"}
          </p>
        </div>
        <Tabs
          value={activeView}
          onValueChange={(v) => setActiveView(v as ViewType)}
        >
          <TabsList>
            {viewTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {activeView === "chat" && (
          sessionId ? <ChatThread sessionId={sessionId} /> : <EmptyState />
        )}
        {activeView === "tasks" && <TaskList />}
        {activeView === "board" && <KanbanBoard />}
        {activeView === "contacts" && <ContactList />}
      </div>

      {activeView === "chat" && <ChatComposer />}
    </div>
  );
}
