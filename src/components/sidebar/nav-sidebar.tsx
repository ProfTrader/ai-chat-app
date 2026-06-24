import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ProfileSection } from "@/components/profile/profile-section";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { Project, Session } from "@/types";

const listItemClass = (isActive: boolean) =>
  cn(
    "h-auto w-full justify-start rounded-md px-2.5 py-2 font-normal",
    isActive
      ? "bg-active-soft text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

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
    <Button
      variant="ghost"
      className={listItemClass(isActive)}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
      <span className="truncate">{label}</span>
    </Button>
  );
}

function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const setProjectId = useSelectionStore((s) => s.setProjectId);

  return (
    <Button
      variant="ghost"
      className={listItemClass(isActive)}
      onClick={() => setProjectId(project.id)}
    >
      <ChevronRight data-icon="inline-start" />
      <span className="truncate">{project.name}</span>
    </Button>
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
    <Button
      variant="ghost"
      className={listItemClass(isActive)}
      onClick={() => {
        setProjectId(session.projectId);
        setSessionId(session.id);
      }}
    >
      {session.pinned ? (
        <Pin data-icon="inline-start" className="text-fin" />
      ) : (
        <span className="size-4 shrink-0" data-icon="inline-start" />
      )}
      <span className="min-w-0 flex-1 text-left">
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
    </Button>
  );
}

function ProjectsPanel({ query }: { query: string }) {
  const { projects, sessions } = useDataStore();
  const { workspaceId, projectId, sessionId } = useSelectionStore();

  const workspaceProjects = useMemo(
    () =>
      projects
        .filter((p) => p.workspaceId === workspaceId)
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, workspaceId, query],
  );

  const projectSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.projectId === projectId)
        .filter((s) => s.title.toLowerCase().includes(query.toLowerCase())),
    [sessions, projectId, query],
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
          <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
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

function InboxPanel({ query }: { query: string }) {
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
    () =>
      sessions
        .filter((session) => workspaceProjectIds.has(session.projectId))
        .filter((session) => session.title.toLowerCase().includes(query.toLowerCase())),
    [sessions, workspaceProjectIds, query],
  );

  const pinnedSessions = inboxSessions.filter((session) => session.pinned);
  const recentSessions = inboxSessions.filter((session) => !session.pinned);

  return (
    <div className="flex flex-col gap-5 p-3">
      {pinnedSessions.length > 0 && (
        <section>
          <p className="mb-1.5 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
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
  const { sidebarMode, setSidebarMode, setCommandOpen, setSettingsOpen, setActiveView } =
    useShellStore();
  const { projectId, setSessionId } = useSelectionStore();
  const addSession = useDataStore((s) => s.addSession);
  const [query, setQuery] = useState("");

  const handleNewSession = async () => {
    if (!projectId) return;
    const session = await addSession(projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-pane">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Workspace
            </p>
            <p className="mt-1 truncate text-base font-medium">Acme Corp</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => void handleNewSession()}
                  />
                }
              >
                <SquarePen />
              </TooltipTrigger>
              <TooltipContent>New session</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => setCommandOpen(true)}
                  />
                }
              >
                <Search />
              </TooltipTrigger>
              <TooltipContent>Search (Ctrl+K)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter sessions and projects"
          className="h-8 border-border bg-pane"
        />
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
        {sidebarMode === "inbox" ? (
          <InboxPanel query={query} />
        ) : (
          <ProjectsPanel query={query} />
        )}
      </ScrollArea>

      <div className="flex flex-col gap-2 border-t border-border px-2 py-2">
        <ProfileSection />
        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => setSettingsOpen(true)}
                />
              }
            >
              <Settings />
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
