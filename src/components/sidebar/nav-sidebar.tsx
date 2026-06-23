import { useMemo } from "react";
import {
  ChevronRight,
  FolderKanban,
  Inbox,
  Pin,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { Project, Session } from "@/types";

function formatRelativeTime(value: string) {
  return value;
}

function SidebarNavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const setProjectId = useSelectionStore((s) => s.setProjectId);

  return (
    <button
      type="button"
      onClick={() => setProjectId(project.id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <ChevronRight className="size-4 shrink-0 opacity-50" />
      <span className="truncate">{project.name}</span>
    </button>
  );
}

function SessionItem({
  session,
  isActive,
  showProject,
  projectName,
}: {
  session: Session;
  isActive: boolean;
  showProject?: boolean;
  projectName?: string;
}) {
  const { setProjectId, setSessionId } = useSelectionStore();

  return (
    <button
      type="button"
      onClick={() => {
        setProjectId(session.projectId);
        setSessionId(session.id);
      }}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {session.pinned ? (
        <Pin className="size-4 shrink-0 text-destructive" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{session.title}</span>
        {showProject && projectName && (
          <span className="block truncate text-xs text-muted-foreground/70">
            {projectName}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground/70">
        {formatRelativeTime(session.updatedAt)}
      </span>
    </button>
  );
}

function ProjectsPanel() {
  const { projects, sessions } = useDataStore();
  const { workspaceId, projectId, sessionId } = useSelectionStore();

  const workspaceProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === workspaceId),
    [projects, workspaceId],
  );

  const projectSessions = useMemo(
    () => sessions.filter((s) => s.projectId === projectId),
    [sessions, projectId],
  );

  const pinnedSessions = projectSessions.filter((s) => s.pinned);
  const otherSessions = projectSessions.filter((s) => !s.pinned);

  return (
    <div className="flex flex-col gap-5 p-3">
      <section>
        <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Projects
        </p>
        <div className="flex flex-col gap-0.5">
          {workspaceProjects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              isActive={project.id === projectId}
            />
          ))}
        </div>
      </section>

      {pinnedSessions.length > 0 && (
        <section>
          <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-destructive uppercase">
            Pinned
          </p>
          <div className="flex flex-col gap-0.5">
            {pinnedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === sessionId}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Sessions ({projectSessions.length})
        </p>
        <div className="flex flex-col gap-0.5">
          {otherSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === sessionId}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function InboxPanel() {
  const { projects, sessions } = useDataStore();
  const { workspaceId, sessionId } = useSelectionStore();

  const workspaceProjectIds = useMemo(
    () => new Set(projects.filter((p) => p.workspaceId === workspaceId).map((p) => p.id)),
    [projects, workspaceId],
  );

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const inboxSessions = useMemo(
    () => sessions.filter((session) => workspaceProjectIds.has(session.projectId)),
    [sessions, workspaceProjectIds],
  );

  const pinnedSessions = inboxSessions.filter((session) => session.pinned);
  const recentSessions = inboxSessions.filter((session) => !session.pinned);

  return (
    <div className="flex flex-col gap-5 p-3">
      {pinnedSessions.length > 0 && (
        <section>
          <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-destructive uppercase">
            Pinned
          </p>
          <div className="flex flex-col gap-0.5">
            {pinnedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === sessionId}
                showProject
                projectName={projectNameById.get(session.projectId)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Recent ({inboxSessions.length})
        </p>
        <div className="flex flex-col gap-0.5">
          {recentSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === sessionId}
              showProject
              projectName={projectNameById.get(session.projectId)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function NavSidebar() {
  const { sidebarMode, setSidebarMode, setCommandOpen } = useShellStore();

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Workspace
            </p>
            <p className="mt-1 truncate text-base font-medium">Acme Corp</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              title="New session"
            >
              <SquarePen />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => setCommandOpen(true)}
              title="Search (Ctrl+K)"
            >
              <Search />
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-border px-2 py-2">
        <div className="flex flex-col gap-0.5 px-1">
          <SidebarNavItem
            icon={Inbox}
            label="Inbox"
            isActive={sidebarMode === "inbox"}
            onClick={() => setSidebarMode("inbox")}
          />
          <SidebarNavItem
            icon={FolderKanban}
            label="Projects"
            isActive={sidebarMode === "projects"}
            onClick={() => setSidebarMode("projects")}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {sidebarMode === "inbox" ? <InboxPanel /> : <ProjectsPanel />}
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border px-2 py-2">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          title="Settings"
        >
          <Settings />
        </Button>
      </div>
    </div>
  );
}
