import { useMemo, useState } from "react";
import {
  Archive,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Columns3,
  ContactRound,
  FileText,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Network,
  Pin,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { currentUser } from "@/lib/current-user";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { Project, Session, ViewType } from "@/types";

const projectFiles: {
  value: ViewType;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "briefs", label: "Briefs", icon: FileText },
  { value: "tasks", label: "Tasks", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "contacts", label: "Team", icon: ContactRound },
];

function isProjectFileView(view: ViewType) {
  return projectFiles.some((file) => file.value === view);
}

const utilityViews: { value: ViewType; label: string; icon: LucideIcon }[] = [
  { value: "timeline", label: "Timeline", icon: CalendarDays },
  { value: "nodes", label: "Agent builder", icon: Network },
];

const workspaceUtilities: { label: string; icon: LucideIcon }[] = [
  { label: "All teammates", icon: Users },
  { label: "Companies", icon: Building2 },
  { label: "Automations", icon: Bot },
  { label: "Reports", icon: LayoutDashboard },
  { label: "Archived", icon: Archive },
];

const navButtonClass = (isActive: boolean) =>
  cn(
    "h-8 w-full justify-start rounded-md px-2 text-sm font-normal",
    isActive
      ? "bg-active-soft text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function WorkspaceButton() {
  return (
    <Button
      variant="ghost"
      className="h-11 w-full justify-start gap-2 rounded-none border-b border-border px-3"
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        NX
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">Nexus</span>
        <span className="block truncate text-xs text-muted-foreground">
          Operator workspace
        </span>
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

function ModuleButton({
  icon: Icon,
  label,
  isActive,
  count,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={navButtonClass(Boolean(isActive))}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
      <span className="truncate">{label}</span>
      {count ? (
        <Badge variant="secondary" className="ml-auto h-5 min-w-5 rounded-full px-1.5 text-[11px] font-normal">
          {count}
        </Badge>
      ) : null}
    </Button>
  );
}

function TrialCallout() {
  return (
    <div className="mx-3 rounded-md bg-muted px-3 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles data-icon="inline-start" />
        <span>AI workspace trial</span>
      </div>
      <Button className="mt-3 rounded-full" size="sm">
        Upgrade
      </Button>
    </div>
  );
}

function AccountMenu() {
  const { setProfileOpen, setSettingsOpen } = useShellStore();

  return (
    <div className="border-t border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 font-normal"
            />
          }
        >
          <PersonAvatar
            name={currentUser.name}
            avatarUrl={currentUser.avatarUrl}
            status={currentUser.status}
            size="sm"
            shape="square"
          />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">
              {currentUser.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {currentUser.role}
            </span>
          </span>
          <MoreHorizontal data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
              <Users data-icon="inline-start" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings data-icon="inline-start" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuItem>
              <Bell data-icon="inline-start" />
              Notifications
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Users data-icon="inline-start" />
              Members and teams
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mt-1 flex items-center justify-between px-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <Settings />
        </Button>
      </div>
    </div>
  );
}

function ProjectFileItem({
  icon: Icon,
  label,
  count,
  isActive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-8 w-full justify-start gap-2 rounded-md px-2 text-sm font-normal",
        isActive
          ? "bg-active-soft text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
      <span className="truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </Button>
  );
}

function SessionTreeRow({
  session,
  isActive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-8 w-full justify-start gap-2 rounded-md px-2 pl-6 text-sm font-normal",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
    >
      {session.pinned ? (
        <Pin className="size-3.5 shrink-0 text-fin" />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/45" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{session.title}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {formatRelativeTime(session.updatedAt)}
      </span>
    </Button>
  );
}

function SessionCategory({
  label,
  sessions,
  activeSessionId,
  activeView,
  onSelect,
}: {
  label: string;
  sessions: Session[];
  activeSessionId: string | null;
  activeView: ViewType;
  onSelect: (session: Session) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-0.5 pl-6 pt-1.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      {sessions.map((session) => (
        <SessionTreeRow
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId && activeView === "chat"}
          onClick={() => onSelect(session)}
        />
      ))}
    </div>
  );
}

function ProjectTreeItem({
  project,
  isActive,
  sessions,
  activeSessionId,
  activeView,
  counts,
}: {
  project: Project;
  isActive: boolean;
  sessions: Session[];
  activeSessionId: string | null;
  activeView: ViewType;
  counts: Partial<Record<ViewType, number>>;
}) {
  const { setProjectId, setSessionId } = useSelectionStore();
  const { setActiveView, setSidebarMode } = useShellStore();

  const firstSession = sessions[0];
  const pinnedSessions = sessions.filter((session) => session.pinned);
  const recentSessions = sessions.filter((session) => !session.pinned);
  const selectSession = (session: Session) => {
    setProjectId(session.projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
  };
  const openProject = () => {
    setProjectId(project.id);
    setSidebarMode("projects");
    const shouldOpenChat = !isProjectFileView(activeView);
    if (shouldOpenChat) {
      setActiveView("chat");
    }
    if ((activeView === "chat" || shouldOpenChat) && !sessions.some((session) => session.id === activeSessionId)) {
      setSessionId(firstSession?.id ?? null);
    }
  };

  const openFile = (view: ViewType) => {
    setProjectId(project.id);
    setSidebarMode("projects");
    setActiveView(view);
    if (view === "chat") {
      setSessionId(
        sessions.some((session) => session.id === activeSessionId)
          ? activeSessionId
          : firstSession?.id ?? null,
      );
    }
  };

  return (
    <div className="py-1">
      <Button
        variant="ghost"
        className={cn(
          "h-8 w-full justify-start gap-2 rounded-md px-2 font-normal",
          isActive ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/70",
        )}
        onClick={openProject}
      >
        {isActive ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <FolderOpen className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {project.name}
        </span>
      </Button>

      {isActive ? (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border/70 pl-2">
          <ProjectFileItem
            icon={MessageSquare}
            label="Chat"
            count={counts.chat}
            isActive={activeView === "chat"}
            onClick={() => openFile("chat")}
          />
          {sessions.length === 0 ? (
            <div className="rounded-md px-2 py-1.5 pl-6 text-xs text-muted-foreground">
              No chat threads yet.
            </div>
          ) : (
            <div className="mb-1 space-y-0.5">
              <SessionCategory
                label="Pinned"
                sessions={pinnedSessions}
                activeSessionId={activeSessionId}
                activeView={activeView}
                onSelect={selectSession}
              />
              <SessionCategory
                label={pinnedSessions.length > 0 ? "Recent" : "Sessions"}
                sessions={recentSessions}
                activeSessionId={activeSessionId}
                activeView={activeView}
                onSelect={selectSession}
              />
            </div>
          )}

          {projectFiles
            .filter((file) => file.value !== "chat")
            .map(({ value, label, icon }) => (
              <ProjectFileItem
                key={value}
                icon={icon}
                label={label}
                count={counts[value]}
                isActive={activeView === value}
                onClick={() => openFile(value)}
              />
            ))}
        </div>
      ) : null}
    </div>
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
  const setActiveView = useShellStore((s) => s.setActiveView);

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-none border-b border-border px-3 py-3 font-normal",
        isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70",
      )}
      onClick={() => {
        setProjectId(session.projectId);
        setSessionId(session.id);
        setActiveView("chat");
      }}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-xs font-semibold",
          session.pinned && "border-fin/30 bg-fin/10 text-fin",
        )}
      >
        {session.pinned ? <Pin data-icon="inline-start" /> : session.title.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">
          {session.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {showProject && projectName ? `${projectName} · ` : ""}
          {formatRelativeTime(session.updatedAt)}
        </span>
      </span>
    </Button>
  );
}

function QueuePanel({ query }: { query: string }) {
  const { projects, sessions, tasks, workRuns, getTeamMembersByProject } = useDataStore();
  const { workspaceId, projectId, sessionId } = useSelectionStore();
  const { activeView, sidebarMode } = useShellStore();

  const workspaceProjects = useMemo(
    () =>
      projects
        .filter((project) => project.workspaceId === workspaceId)
        .filter((project) => {
          const normalizedQuery = query.toLowerCase();
          if (!normalizedQuery) return true;
          return (
            project.name.toLowerCase().includes(normalizedQuery) ||
            sessions.some(
              (session) =>
                session.projectId === project.id &&
                session.title.toLowerCase().includes(normalizedQuery),
            )
          );
        }),
    [projects, query, sessions, workspaceId],
  );

  const workspaceProjectIds = useMemo(
    () => new Set(workspaceProjects.map((project) => project.id)),
    [workspaceProjects],
  );

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) =>
          sidebarMode === "projects"
            ? session.projectId === projectId
            : workspaceProjectIds.has(session.projectId),
        )
        .filter((session) => session.title.toLowerCase().includes(query.toLowerCase())),
    [sessions, sidebarMode, projectId, workspaceProjectIds, query],
  );

  const sessionsByProjectId = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    for (const session of sessions) {
      if (!workspaceProjectIds.has(session.projectId)) continue;
      grouped.set(session.projectId, [...(grouped.get(session.projectId) ?? []), session]);
    }
    return grouped;
  }, [sessions, workspaceProjectIds]);

  const countsForProject = (id: string): Partial<Record<ViewType, number>> => {
    const projectTasks = tasks.filter((task) => task.projectId === id);
    return {
      chat: sessions.filter((session) => session.projectId === id).length,
      briefs: workRuns.filter((run) => run.projectId === id).length,
      tasks: projectTasks.filter((task) => task.status !== "done").length,
      board: projectTasks.length,
      contacts: getTeamMembersByProject(id).length,
    };
  };

  if (sidebarMode === "projects") {
    return (
      <div className="p-2">
        <div className="mb-1 flex items-center gap-2 px-1 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FolderOpen className="size-3.5" />
          Projects
        </div>
        {workspaceProjects.map((project) => (
          <ProjectTreeItem
            key={project.id}
            project={project}
            isActive={project.id === projectId}
            sessions={sessionsByProjectId.get(project.id) ?? []}
            activeSessionId={sessionId}
            activeView={activeView}
            counts={countsForProject(project.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Inbox
      </div>
      {visibleSessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          isActive={session.id === sessionId}
          showProject
          projectName={projectNameById.get(session.projectId)}
        />
      ))}
    </div>
  );
}

export function NavSidebar() {
  const {
    activeView,
    sidebarMode,
    setActiveView,
    setSidebarMode,
    setCommandOpen,
  } = useShellStore();
  const { projectId, setSessionId } = useSelectionStore();
  const addSession = useDataStore((s) => s.addSession);
  const inboxCount = useDataStore((s) => s.sessions.length);
  const projectCount = useDataStore((s) => s.projects.length);
  const [query, setQuery] = useState("");

  const handleNewSession = async () => {
    if (!projectId) return;
    const session = await addSession(projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
  };

  return (
    <div className="grid h-full min-w-0 grid-cols-[224px_minmax(220px,1fr)] overflow-hidden bg-pane">
      <aside className="flex min-w-0 flex-col border-r border-border">
        <WorkspaceButton />
        <div className="flex min-h-0 flex-1 flex-col gap-4 py-3">
          <TrialCallout />
          <div className="flex flex-col gap-0.5 px-2">
            <ModuleButton
              icon={Inbox}
              label="Inbox"
              count={inboxCount}
              isActive={sidebarMode === "inbox"}
              onClick={() => {
                setSidebarMode("inbox");
                setActiveView("chat");
              }}
            />
            <ModuleButton
              icon={FolderOpen}
              label="Projects"
              count={projectCount}
              isActive={sidebarMode === "projects"}
              onClick={() => {
                setSidebarMode("projects");
                if (!isProjectFileView(activeView)) setActiveView("chat");
              }}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-0.5 px-2">
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Utilities
            </p>
            {utilityViews.map(({ value, label, icon }) => (
              <ModuleButton
                key={value}
                icon={icon}
                label={label}
                isActive={activeView === value}
                onClick={() => setActiveView(value)}
              />
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-0.5 px-2">
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Workspace
            </p>
            {workspaceUtilities.slice(0, 3).map(({ label, icon }) => (
              <ModuleButton key={label} icon={icon} label={label} />
            ))}
          </div>
        </div>
        <AccountMenu />
      </aside>

      <section className="flex min-w-0 flex-col">
        <div className="flex h-11 items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
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
            <TooltipContent>Search all</TooltipContent>
          </Tooltip>
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
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <QueuePanel query={query} />
        </ScrollArea>
      </section>
    </div>
  );
}
