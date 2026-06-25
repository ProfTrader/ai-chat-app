import { useMemo, useState } from "react";
import {
  Archive,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  ChevronRight,
  Columns3,
  ContactRound,
  Inbox,
  LayoutDashboard,
  ListTodo,
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

const primaryViews: {
  value: ViewType;
  label: string;
  icon: LucideIcon;
  count?: number;
}[] = [
  { value: "chat", label: "Inbox", icon: Inbox, count: 3 },
  { value: "tasks", label: "Tasks", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "contacts", label: "Contacts", icon: ContactRound },
  { value: "nodes", label: "Agent builder", icon: Network },
];

const sharedViews: { label: string; icon: LucideIcon }[] = [
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
        <Badge variant="destructive" className="ml-auto size-5 rounded-full px-0 text-[11px]">
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

function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const setProjectId = useSelectionStore((s) => s.setProjectId);

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-none border-b border-border px-3 py-3 font-normal",
        isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70",
      )}
      onClick={() => setProjectId(project.id)}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-xs font-semibold">
        {project.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">
          {project.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          Shared project
        </span>
      </span>
      <ChevronRight data-icon="inline-end" />
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
  const { projects, sessions } = useDataStore();
  const { workspaceId, projectId, sessionId } = useSelectionStore();
  const sidebarMode = useShellStore((s) => s.sidebarMode);

  const workspaceProjects = useMemo(
    () =>
      projects
        .filter((project) => project.workspaceId === workspaceId)
        .filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
    [projects, workspaceId, query],
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

  if (sidebarMode === "projects") {
    return (
      <div>
        <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </div>
        {workspaceProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={project.id === projectId}
          />
        ))}
        <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sessions
        </div>
        {visibleSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === sessionId}
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
            {primaryViews.map(({ value, label, icon, count }) => (
              <ModuleButton
                key={value}
                icon={icon}
                label={label}
                count={count}
                isActive={activeView === value}
                onClick={() => {
                  setActiveView(value);
                  if (value === "chat") setSidebarMode("inbox");
                }}
              />
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-0.5 px-2">
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Teams
            </p>
            {sharedViews.map(({ label, icon }) => (
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

        <div className="grid grid-cols-2 border-b border-border p-2">
          <Button
            variant={sidebarMode === "inbox" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSidebarMode("inbox")}
          >
            Inbox
          </Button>
          <Button
            variant={sidebarMode === "projects" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSidebarMode("projects")}
          >
            Projects
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <QueuePanel query={query} />
        </ScrollArea>
      </section>
    </div>
  );
}
