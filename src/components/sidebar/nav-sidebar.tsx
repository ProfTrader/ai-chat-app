import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
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
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { useOnboardingStore } from "@/stores/onboarding-store";
import { firmProfileHtmlUrl } from "@/lib/onboarding/client";
import { toast } from "sonner";
import type { Project, Session, ViewType } from "@/types";

const projectFiles: {
  value: ViewType;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "files", label: "Files", icon: FolderOpen },
  { value: "tasks", label: "Tasks", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "contacts", label: "Team", icon: ContactRound },
  { value: "timeline", label: "Monitor", icon: CalendarDays },
];

function isProjectFileView(view: ViewType) {
  return projectFiles.some((file) => file.value === view);
}

const utilityViews: { value: ViewType; label: string; icon: LucideIcon }[] = [
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

const notificationKeys = {
  inbox: (workspaceId: string) => `workspace:${workspaceId}:inbox`,
  projects: (workspaceId: string) => `workspace:${workspaceId}:projects`,
  session: (sessionId: string) => `session:${sessionId}`,
  projectView: (projectId: string, view: ViewType) => `project:${projectId}:${view}`,
};

function hasUnreadSince({
  timestamp,
  key,
  readAt,
  baseline,
}: {
  timestamp?: string;
  key: string;
  readAt: Record<string, string>;
  baseline: string | null;
}) {
  if (!timestamp || !baseline) return false;
  const seenAt = readAt[key] ?? baseline;
  return new Date(timestamp).getTime() > new Date(seenAt).getTime();
}

function latestTimestamp(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function sumUnreadCounts(counts: Partial<Record<ViewType, number>>) {
  return Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
}

function NotificationBadge({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span
      className="ml-auto inline-flex size-3 shrink-0 items-center justify-center rounded-full ring-2 ring-active-soft"
      aria-label={`${count} unread notifications`}
      title={`${count} unread notifications`}
    >
      <span className="size-1.5 rounded-full bg-active" />
    </span>
  );
}

function AiWorkingDot({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="grid size-6 place-items-center rounded-full bg-active-soft"
            aria-label="AI is working"
            role="status"
          />
        }
      >
        <span className="shimmer shimmer-duration-1000 text-sm leading-none text-active">
          ●
        </span>
      </TooltipTrigger>
      <TooltipContent>AI is working</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceButton() {
  const workspaces = useDataStore((s) => s.workspaces);
  const workspaceId = useSelectionStore((s) => s.workspaceId);
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0];
  const name = workspace?.name ?? "My Workspace";
  const initials =
    name
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "NX";

  return (
    <Button
      variant="ghost"
      className="h-11 w-full justify-start gap-2 rounded-none border-b border-border px-3"
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        {initials}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{name}</span>
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
      <span className="fade-text-r min-w-0 flex-1 text-left">{label}</span>
      <NotificationBadge count={count} />
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
  const restartOnboarding = useOnboardingStore((s) => s.restart);
  const hasFirmProfile = useOnboardingStore((s) => Boolean(s.profile));

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
            <DropdownMenuLabel>Firm memory</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => restartOnboarding()}>
              <Sparkles data-icon="inline-start" />
              {hasFirmProfile ? "Update business profile" : "Set up business profile"}
            </DropdownMenuItem>
            {hasFirmProfile ? (
              <DropdownMenuItem
                onClick={() => window.open(firmProfileHtmlUrl, "_blank", "noopener,noreferrer")}
              >
                <FileText data-icon="inline-start" />
                Open firm profile
              </DropdownMenuItem>
            ) : null}
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
      <span className="fade-text-r min-w-0 flex-1 text-left">{label}</span>
      <NotificationBadge count={count} />
    </Button>
  );
}

function ProjectChatItem({
  count,
  isActive,
  canArchive,
  onOpen,
  onCreate,
  onArchive,
}: {
  count?: number;
  isActive?: boolean;
  canArchive: boolean;
  onOpen: () => void;
  onCreate: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      className={cn(
        "relative flex h-8 w-full items-center overflow-hidden rounded-md px-2 text-sm",
        isActive
          ? "bg-active-soft text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 pr-12 text-left"
        onClick={onOpen}
      >
        <MessageSquare className="size-3.5 shrink-0" />
        <span className="fade-text-r min-w-0 flex-1">Chat</span>
        <NotificationBadge count={count} />
      </button>
      <div className="absolute right-1 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="New chat in project"
                onClick={onCreate}
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>New chat</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                disabled={!canArchive}
                aria-label="Archive active project chat"
                onClick={onArchive}
              />
            }
          >
            <Archive />
          </TooltipTrigger>
          <TooltipContent>Archive active chat</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function SessionTreeRow({
  session,
  isActive,
  unreadCount,
  onArchive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  unreadCount?: number;
  onArchive: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "group/session relative flex h-8 w-full items-center overflow-hidden rounded-md pr-1 text-sm font-normal",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 py-1.5 pl-6 text-left"
        onClick={onClick}
      >
        {session.pinned ? (
          <Pin className="size-3.5 shrink-0 text-fin" />
        ) : (
          <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/45" />
        )}
        <span className="fade-text-r min-w-0 flex-1">{session.title}</span>
        <NotificationBadge count={unreadCount} />
        {!unreadCount ? (
          <span className="shrink-0 text-[11px] text-muted-foreground transition-opacity group-hover/session:opacity-0">
            {formatRelativeTime(session.updatedAt)}
          </span>
        ) : null}
      </button>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 text-muted-foreground opacity-0 transition-opacity group-hover/session:opacity-100 focus-visible:opacity-100"
              aria-label={`Archive ${session.title}`}
              onClick={onArchive}
            />
          }
        >
          <Archive />
        </TooltipTrigger>
        <TooltipContent>Archive session</TooltipContent>
      </Tooltip>
    </div>
  );
}

function SessionCategory({
  label,
  sessions,
  activeSessionId,
  activeView,
  unreadCounts,
  onArchive,
  onSelect,
}: {
  label: string;
  sessions: Session[];
  activeSessionId: string | null;
  activeView: ViewType;
  unreadCounts: Map<string, number>;
  onArchive: (session: Session) => void;
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
          unreadCount={unreadCounts.get(session.id)}
          onArchive={() => onArchive(session)}
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
  sessionUnreadCounts,
  unreadCount,
}: {
  project: Project;
  isActive: boolean;
  sessions: Session[];
  activeSessionId: string | null;
  activeView: ViewType;
  counts: Partial<Record<ViewType, number>>;
  sessionUnreadCounts: Map<string, number>;
  unreadCount?: number;
}) {
  const { setProjectId, setSessionId } = useSelectionStore();
  const { setActiveView, setSidebarMode } = useShellStore();
  const addSession = useDataStore((s) => s.addSession);
  const archiveSession = useDataStore((s) => s.archiveSession);
  const archiveProject = useDataStore((s) => s.archiveProject);

  const firstSession = sessions[0];
  const pinnedSessions = sessions.filter((session) => session.pinned);
  const recentSessions = sessions.filter((session) => !session.pinned);
  const selectSession = (session: Session) => {
    setProjectId(session.projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
  };
  const createSession = async () => {
    const session = await addSession(project.id);
    setProjectId(project.id);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
    toast.success("Chat created");
  };
  const archiveProjectSession = (session: Session) => {
    archiveSession(session.id);
    if (session.id === activeSessionId) {
      const nextSession = sessions.find((item) => item.id !== session.id);
      setSessionId(nextSession?.id ?? null);
    }
    toast.success(`${session.title} archived`);
  };
  const archiveActiveSession = () => {
    const session = sessions.find((item) => item.id === activeSessionId) ?? firstSession;
    if (!session) return;
    archiveProjectSession(session);
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
      <div className="group/proj relative flex items-center">
        <Button
          variant="ghost"
          className={cn(
            "h-8 w-full justify-start gap-2 rounded-md px-2 pr-7 font-normal",
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
          <span className="fade-text-r min-w-0 flex-1 text-left text-sm font-medium">
            {project.name}
          </span>
          <NotificationBadge count={unreadCount} />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 text-muted-foreground opacity-0 transition-opacity group-hover/proj:opacity-100 focus-visible:opacity-100"
                aria-label={`Archive ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  archiveProject(project.id);
                  toast.success(`${project.name} archived`);
                }}
              />
            }
          >
            <Archive />
          </TooltipTrigger>
          <TooltipContent>Archive team</TooltipContent>
        </Tooltip>
      </div>

      {isActive ? (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border/70 pl-2">
          <ProjectChatItem
            count={counts.chat}
            isActive={activeView === "chat"}
            canArchive={sessions.length > 0}
            onOpen={() => openFile("chat")}
            onCreate={() => void createSession()}
            onArchive={archiveActiveSession}
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
                unreadCounts={sessionUnreadCounts}
                onArchive={archiveProjectSession}
                onSelect={selectSession}
              />
              <SessionCategory
                label={pinnedSessions.length > 0 ? "Recent" : "Sessions"}
                sessions={recentSessions}
                activeSessionId={activeSessionId}
                activeView={activeView}
                unreadCounts={sessionUnreadCounts}
                onArchive={archiveProjectSession}
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
  unreadCount,
  showProject,
  projectName,
}: {
  session: Session;
  isActive: boolean;
  unreadCount?: number;
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
      <NotificationBadge count={unreadCount} />
    </Button>
  );
}

function ChatQueueRow({
  session,
  isActive,
  unread,
  projectName,
  workspaceProjects,
  onOpen,
  onAssign,
  onArchive,
}: {
  session: Session;
  isActive: boolean;
  unread: boolean;
  projectName: string;
  workspaceProjects: Project[];
  onOpen: () => void;
  onAssign: (projectId: string) => void;
  onArchive: () => void;
}) {
  return (
    <div
      className={cn(
        "group/chat relative flex w-full items-center overflow-hidden rounded-md px-2 text-sm",
        isActive
          ? "bg-active-soft text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-16 text-left"
        onClick={onOpen}
      >
        <MessageSquare className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="fade-text-r block truncate">{session.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {projectName} · {formatRelativeTime(session.updatedAt)}
          </span>
        </span>
        {unread ? <NotificationBadge count={1} /> : null}
      </button>
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/chat:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground"
                      aria-label="Assign chat to a team"
                    />
                  }
                />
              }
            >
              <FolderOpen />
            </TooltipTrigger>
            <TooltipContent>Assign to team</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Assign to team</DropdownMenuLabel>
            <DropdownMenuGroup>
              {workspaceProjects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  disabled={project.id === session.projectId}
                  onClick={() => onAssign(project.id)}
                >
                  <FolderOpen data-icon="inline-start" />
                  {project.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {session.projectId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAssign("")}>
                  <Inbox data-icon="inline-start" />
                  Unassign
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={`Archive ${session.title}`}
                onClick={onArchive}
              />
            }
          >
            <Archive />
          </TooltipTrigger>
          <TooltipContent>Archive chat</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ChatQueue({ query }: { query: string }) {
  const { sessions, projects, messages, addSession, moveSession, archiveSession } =
    useDataStore();
  const { workspaceId, sessionId, setProjectId, setSessionId } =
    useSelectionStore();
  const { setActiveView, setSidebarMode, notificationReadAt, notificationsInitializedAt } =
    useShellStore();

  const workspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === workspaceId && !project.archivedAt),
    [projects, workspaceId],
  );
  const workspaceProjectIds = useMemo(
    () => new Set(workspaceProjects.map((project) => project.id)),
    [workspaceProjects],
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const unreadSessionIds = useMemo(() => {
    const latestBySession = new Map<string, string>();
    messages.forEach((message) => {
      if (message.role === "user") return;
      const previous = latestBySession.get(message.sessionId);
      if (!previous || new Date(message.createdAt) > new Date(previous)) {
        latestBySession.set(message.sessionId, message.createdAt);
      }
    });
    const result = new Set<string>();
    if (!notificationsInitializedAt) return result;
    sessions.forEach((session) => {
      const timestamp = latestBySession.get(session.id) ?? session.updatedAt;
      const seenAt =
        notificationReadAt[notificationKeys.session(session.id)] ?? notificationsInitializedAt;
      if (new Date(timestamp).getTime() > new Date(seenAt).getTime()) {
        result.add(session.id);
      }
    });
    return result;
  }, [messages, notificationReadAt, notificationsInitializedAt, sessions]);

  const chatSessions = useMemo(
    () =>
      sessions
        .filter((session) => !session.archivedAt)
        .filter(
          (session) => session.projectId === "" || workspaceProjectIds.has(session.projectId),
        )
        .filter((session) => session.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [query, sessions, workspaceProjectIds],
  );

  const openSession = (session: Session) => {
    setProjectId(session.projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("chat");
  };

  const createChat = async () => {
    const session = await addSession("", "New chat");
    setProjectId("");
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("chat");
    toast.success("Chat started — assign it to a project when you're ready");
  };

  const assignSession = (session: Session, nextProjectId: string) => {
    moveSession(session.id, nextProjectId);
    if (session.id === sessionId) setProjectId(nextProjectId);
    toast.success(
      nextProjectId
        ? `Moved to ${projectNameById.get(nextProjectId) ?? "team"}`
        : "Moved to Unassigned",
    );
  };

  const archiveChat = (session: Session) => {
    archiveSession(session.id);
    if (session.id === sessionId) setSessionId(null);
    toast.success(`${session.title} archived`);
  };

  return (
    <div className="p-2">
      <div className="mb-1 flex items-center gap-1 px-1 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MessageSquare className="size-3.5" />
          <span>Chat</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="New chat"
                onClick={() => void createChat()}
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>New chat</TooltipContent>
        </Tooltip>
      </div>
      {chatSessions.length === 0 ? (
        <div className="rounded-md px-2 py-6 text-center text-xs text-muted-foreground">
          No conversations yet. Start a chat and assign it to a team later.
        </div>
      ) : (
        <div className="space-y-0.5">
          {chatSessions.map((session) => (
            <ChatQueueRow
              key={session.id}
              session={session}
              isActive={session.id === sessionId}
              unread={unreadSessionIds.has(session.id)}
              projectName={
                session.projectId
                  ? projectNameById.get(session.projectId) ?? "Team"
                  : "Unassigned"
              }
              workspaceProjects={workspaceProjects}
              onOpen={() => openSession(session)}
              onAssign={(nextProjectId) => assignSession(session, nextProjectId)}
              onArchive={() => archiveChat(session)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueuePanel({ query }: { query: string }) {
  const {
    projects,
    sessions,
    messages,
    tasks,
    workspaceFiles,
    workspaceEvents,
    workRuns,
    addProject,
    archiveProject,
  } = useDataStore();
  const { workspaceId, projectId, sessionId, setProjectId, setSessionId } = useSelectionStore();
  const {
    activeView,
    sidebarMode,
    setActiveView,
    notificationReadAt,
    notificationsInitializedAt,
  } = useShellStore();

  const workspaceProjects = useMemo(
    () =>
      projects
        .filter((project) => project.workspaceId === workspaceId)
        .filter((project) => !project.archivedAt)
        .filter((project) => {
          const normalizedQuery = query.toLowerCase();
          if (!normalizedQuery) return true;
          return (
            project.name.toLowerCase().includes(normalizedQuery) ||
            sessions.some(
              (session) =>
                session.projectId === project.id &&
                !session.archivedAt &&
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
        .filter((session) => !session.archivedAt)
        .filter((session) => session.title.toLowerCase().includes(query.toLowerCase())),
    [sessions, sidebarMode, projectId, workspaceProjectIds, query],
  );

  const sessionsByProjectId = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    for (const session of sessions) {
      if (!workspaceProjectIds.has(session.projectId)) continue;
      if (session.archivedAt) continue;
      grouped.set(session.projectId, [...(grouped.get(session.projectId) ?? []), session]);
    }
    return grouped;
  }, [sessions, workspaceProjectIds]);

  const sessionUnreadCounts = useMemo(() => {
    const groupedMessages = new Map<string, typeof messages>();
    messages.forEach((message) => {
      groupedMessages.set(message.sessionId, [
        ...(groupedMessages.get(message.sessionId) ?? []),
        message,
      ]);
    });

    return new Map(
      sessions
        .filter((session) => !session.archivedAt)
        .map((session) => {
          const key = notificationKeys.session(session.id);
          const unreadMessages = (groupedMessages.get(session.id) ?? []).filter(
            (message) =>
              message.role !== "user" &&
              hasUnreadSince({
                timestamp: message.createdAt,
                key,
                readAt: notificationReadAt,
                baseline: notificationsInitializedAt,
              }),
          ).length;
          const fallbackUnread =
            unreadMessages === 0 &&
            hasUnreadSince({
              timestamp: session.updatedAt,
              key,
              readAt: notificationReadAt,
              baseline: notificationsInitializedAt,
            })
              ? 1
              : 0;

          return [session.id, unreadMessages || fallbackUnread] as const;
        })
        .filter(([, count]) => count > 0),
    );
  }, [messages, notificationReadAt, notificationsInitializedAt, sessions]);

  const countsForProject = (id: string): Partial<Record<ViewType, number>> => {
    const projectTasks = tasks.filter((task) => task.projectId === id && !task.worktreeId);
    const projectFiles = workspaceFiles.filter((file) => file.projectId === id && !file.worktreeId);
    const projectEvents = workspaceEvents.filter((event) => event.projectId === id);
    const projectSessions = sessions.filter(
      (session) => session.projectId === id && !session.archivedAt,
    );
    const projectWorkRuns = workRuns.filter((run) => run.projectId === id);
    return {
      chat: projectSessions.reduce(
        (sum, session) => sum + (sessionUnreadCounts.get(session.id) ?? 0),
        0,
      ),
      briefs: projectWorkRuns.filter((run) =>
        hasUnreadSince({
          timestamp: run.updatedAt,
          key: notificationKeys.projectView(id, "briefs"),
          readAt: notificationReadAt,
          baseline: notificationsInitializedAt,
        }),
      ).length,
      files: projectFiles.filter((file) =>
        hasUnreadSince({
          timestamp: file.updatedAt,
          key: notificationKeys.projectView(id, "files"),
          readAt: notificationReadAt,
          baseline: notificationsInitializedAt,
        }),
      ).length,
      tasks: projectTasks.filter((task) =>
        hasUnreadSince({
          timestamp: task.updatedAt,
          key: notificationKeys.projectView(id, "tasks"),
          readAt: notificationReadAt,
          baseline: notificationsInitializedAt,
        }),
      ).length,
      board: projectTasks.filter((task) =>
        hasUnreadSince({
          timestamp: task.updatedAt,
          key: notificationKeys.projectView(id, "board"),
          readAt: notificationReadAt,
          baseline: notificationsInitializedAt,
        }),
      ).length,
      contacts: 0,
      timeline: projectEvents.filter((event) =>
        hasUnreadSince({
          timestamp: event.createdAt,
          key: notificationKeys.projectView(id, "timeline"),
          readAt: notificationReadAt,
          baseline: notificationsInitializedAt,
        }),
      ).length,
    };
  };
  const createProject = async () => {
    const nextProjectNumber = projects.filter((project) => project.workspaceId === workspaceId).length + 1;
    const project = await addProject(`New Team ${nextProjectNumber}`, workspaceId);
    setProjectId(project.id);
    setSessionId(null);
    setActiveView("chat");
    toast.success("Team created");
  };

  const archiveCurrentProject = () => {
    const currentProject = workspaceProjects.find((project) => project.id === projectId);
    if (!currentProject) return;
    archiveProject(currentProject.id);
    const nextProject = workspaceProjects.find((project) => project.id !== currentProject.id);
    setProjectId(nextProject?.id ?? "");
    setSessionId(null);
    toast.success(`${currentProject.name} archived`);
  };
  const projectsUnreadCount = workspaceProjects.reduce(
    (sum, project) => sum + sumUnreadCounts(countsForProject(project.id)),
    0,
  );

  if (sidebarMode === "chat") {
    return <ChatQueue query={query} />;
  }

  if (sidebarMode === "projects") {
    return (
      <div className="p-2">
        <div className="mb-1 flex items-center gap-1 px-1 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FolderOpen className="size-3.5" />
            <span>Teams</span>
            <NotificationBadge count={projectsUnreadCount} />
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="New team"
                  onClick={() => void createProject()}
                />
              }
            >
              <Plus />
            </TooltipTrigger>
            <TooltipContent>New team</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  disabled={!projectId}
                  aria-label="Archive team"
                  onClick={archiveCurrentProject}
                />
              }
            >
              <Archive />
            </TooltipTrigger>
            <TooltipContent>Archive team</TooltipContent>
          </Tooltip>
        </div>
        {workspaceProjects.map((project) => {
          const counts = countsForProject(project.id);

          return (
            <ProjectTreeItem
              key={project.id}
              project={project}
              isActive={project.id === projectId}
              sessions={sessionsByProjectId.get(project.id) ?? []}
              activeSessionId={sessionId}
              activeView={activeView}
              counts={counts}
              sessionUnreadCounts={sessionUnreadCounts}
              unreadCount={sumUnreadCounts(counts)}
            />
          );
        })}
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
          unreadCount={sessionUnreadCounts.get(session.id)}
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
    setNavCollapsed,
    agentWorking,
    notificationReadAt,
    notificationsInitializedAt,
    initializeNotifications,
    markNotificationReads,
  } = useShellStore();
  const { workspaceId, projectId, sessionId, setSessionId } = useSelectionStore();
  const addSession = useDataStore((s) => s.addSession);
  const archiveSession = useDataStore((s) => s.archiveSession);
  const sessions = useDataStore((s) => s.sessions);
  const messages = useDataStore((s) => s.messages);
  const projects = useDataStore((s) => s.projects);
  const tasks = useDataStore((s) => s.tasks);
  const workspaceFiles = useDataStore((s) => s.workspaceFiles);
  const workspaceEvents = useDataStore((s) => s.workspaceEvents);
  const workRuns = useDataStore((s) => s.workRuns);
  const unreadNotifications = useDataStore(
    (s) => s.notifications.filter((notification) => !notification.read).length,
  );
  const storedAgentWorking = useDataStore((s) =>
    s.agentBrainRuns.some((run) => run.status === "running" || run.status === "queued"),
  );
  const [query, setQuery] = useState("");

  const workspaceProjectIds = useMemo(
    () =>
      new Set(
        projects
          .filter((project) => project.workspaceId === workspaceId && !project.archivedAt)
          .map((project) => project.id),
      ),
    [projects, workspaceId],
  );

  const sessionUnreadCounts = useMemo(() => {
    const groupedMessages = new Map<string, typeof messages>();
    messages.forEach((message) => {
      groupedMessages.set(message.sessionId, [
        ...(groupedMessages.get(message.sessionId) ?? []),
        message,
      ]);
    });

    return new Map(
      sessions
        .filter((session) => !session.archivedAt)
        .map((session) => {
          const key = notificationKeys.session(session.id);
          const unreadMessages = (groupedMessages.get(session.id) ?? []).filter(
            (message) =>
              message.role !== "user" &&
              hasUnreadSince({
                timestamp: message.createdAt,
                key,
                readAt: notificationReadAt,
                baseline: notificationsInitializedAt,
              }),
          ).length;
          const fallbackUnread =
            unreadMessages === 0 &&
            hasUnreadSince({
              timestamp: session.updatedAt,
              key,
              readAt: notificationReadAt,
              baseline: notificationsInitializedAt,
            })
              ? 1
              : 0;

          return [session.id, unreadMessages || fallbackUnread] as const;
        })
        .filter(([, count]) => count > 0),
    );
  }, [messages, notificationReadAt, notificationsInitializedAt, sessions]);

  const projectUnreadTotals = useMemo(
    () =>
      new Map(
        projects
          .filter((project) => project.workspaceId === workspaceId && !project.archivedAt)
          .map((project) => {
            const projectSessions = sessions.filter(
              (session) => session.projectId === project.id && !session.archivedAt,
            );
            const chatUnread = projectSessions.reduce(
              (sum, session) => sum + (sessionUnreadCounts.get(session.id) ?? 0),
              0,
            );
            const taskUnread = tasks.filter(
              (task) =>
                task.projectId === project.id &&
                !task.worktreeId &&
                hasUnreadSince({
                  timestamp: task.updatedAt,
                  key: notificationKeys.projectView(project.id, "tasks"),
                  readAt: notificationReadAt,
                  baseline: notificationsInitializedAt,
                }),
            ).length;
            const boardUnread = tasks.filter(
              (task) =>
                task.projectId === project.id &&
                !task.worktreeId &&
                hasUnreadSince({
                  timestamp: task.updatedAt,
                  key: notificationKeys.projectView(project.id, "board"),
                  readAt: notificationReadAt,
                  baseline: notificationsInitializedAt,
                }),
            ).length;
            const briefUnread = workRuns.filter(
              (run) =>
                run.projectId === project.id &&
                hasUnreadSince({
                  timestamp: run.updatedAt,
                  key: notificationKeys.projectView(project.id, "briefs"),
                  readAt: notificationReadAt,
                  baseline: notificationsInitializedAt,
                }),
            ).length;
            const fileUnread = workspaceFiles.filter(
              (file) =>
                file.projectId === project.id &&
                !file.worktreeId &&
                hasUnreadSince({
                  timestamp: file.updatedAt,
                  key: notificationKeys.projectView(project.id, "files"),
                  readAt: notificationReadAt,
                  baseline: notificationsInitializedAt,
                }),
            ).length;
            const monitorUnread = workspaceEvents.filter(
              (event) =>
                event.projectId === project.id &&
                hasUnreadSince({
                  timestamp: event.createdAt,
                  key: notificationKeys.projectView(project.id, "timeline"),
                  readAt: notificationReadAt,
                  baseline: notificationsInitializedAt,
                }),
            ).length;

            return [project.id, chatUnread + taskUnread + boardUnread + briefUnread + fileUnread + monitorUnread] as const;
          }),
      ),
    [
      notificationReadAt,
      notificationsInitializedAt,
      projects,
      sessionUnreadCounts,
      sessions,
      tasks,
      workspaceEvents,
      workspaceFiles,
      workRuns,
      workspaceId,
    ],
  );

  const inboxCount = sessions
    .filter((session) => !session.archivedAt && workspaceProjectIds.has(session.projectId))
    .reduce((sum, session) => sum + (sessionUnreadCounts.get(session.id) ?? 0), 0);
  const projectCount = Array.from(projectUnreadTotals.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  const activeReadVersion = useMemo(() => {
    if (!projectId) return sessionId ?? activeView;

    const activeSessionTimestamp =
      sessionId && activeView === "chat"
        ? latestTimestamp([
            sessions.find((session) => session.id === sessionId)?.updatedAt,
            ...messages
              .filter((message) => message.sessionId === sessionId)
              .map((message) => message.createdAt),
          ])
        : undefined;
    const taskTimestamp =
      activeView === "tasks" || activeView === "board"
        ? latestTimestamp(
            tasks
              .filter((task) => task.projectId === projectId && !task.worktreeId)
              .map((task) => task.updatedAt),
          )
        : undefined;
    const fileTimestamp =
      activeView === "files"
        ? latestTimestamp(
            workspaceFiles
              .filter((file) => file.projectId === projectId && !file.worktreeId)
              .map((file) => file.updatedAt),
          )
        : undefined;
    const monitorTimestamp =
      activeView === "timeline"
        ? latestTimestamp(
            workspaceEvents
              .filter((event) => event.projectId === projectId)
              .map((event) => event.createdAt),
          )
        : undefined;
    const briefTimestamp =
      activeView === "briefs"
        ? latestTimestamp(
            workRuns
              .filter((run) => run.projectId === projectId)
              .map((run) => run.updatedAt),
          )
        : undefined;

    return [activeView, projectId, sessionId, activeSessionTimestamp, taskTimestamp, briefTimestamp, fileTimestamp, monitorTimestamp]
      .filter(Boolean)
      .join("|");
  }, [activeView, messages, projectId, sessionId, sessions, tasks, workRuns, workspaceEvents, workspaceFiles]);

  useEffect(() => {
    const now = new Date().toISOString();
    if (!notificationsInitializedAt) {
      initializeNotifications(now);
      return;
    }

    const keys = [
      sidebarMode === "inbox" ? notificationKeys.inbox(workspaceId) : null,
      sidebarMode === "projects" ? notificationKeys.projects(workspaceId) : null,
      projectId && activeView === "chat"
        ? notificationKeys.projectView(projectId, "chat")
        : null,
      projectId && activeView !== "chat" && activeView !== "nodes"
        ? notificationKeys.projectView(projectId, activeView)
        : null,
      sessionId && activeView === "chat" ? notificationKeys.session(sessionId) : null,
    ].filter((key): key is string => Boolean(key));

    markNotificationReads(keys, now);
  }, [
    activeReadVersion,
    activeView,
    initializeNotifications,
    markNotificationReads,
    notificationsInitializedAt,
    projectId,
    sessionId,
    sidebarMode,
    workspaceId,
  ]);

  const handleNewSession = async () => {
    if (!projectId) return;
    const session = await addSession(projectId);
    setSessionId(session.id);
    setActiveView("chat");
    setSidebarMode("projects");
  };

  const handleArchiveSession = () => {
    if (!sessionId) return;
    const session = sessions.find((item) => item.id === sessionId);
    archiveSession(sessionId);
    const nextSession = sessions.find(
      (item) => item.projectId === projectId && item.id !== sessionId && !item.archivedAt,
    );
    setSessionId(nextSession?.id ?? null);
    toast.success(`${session?.title ?? "Chat"} archived`);
  };

  return (
    <div className="grid h-full min-w-0 grid-cols-[200px_minmax(0,1fr)] overflow-hidden bg-pane">
      <aside className="flex min-w-0 flex-col border-r border-border">
        <WorkspaceButton />
        <div className="flex min-h-0 flex-1 flex-col gap-4 py-3">
          <TrialCallout />
          <div className="flex flex-col gap-0.5 px-2">
            <ModuleButton
              icon={MessageSquare}
              label="Chat"
              isActive={sidebarMode === "chat"}
              onClick={() => {
                setSidebarMode("chat");
                setActiveView("chat");
              }}
            />
            <ModuleButton
              icon={Inbox}
              label="Inbox"
              count={unreadNotifications || inboxCount}
              isActive={sidebarMode === "inbox"}
              onClick={() => {
                setSidebarMode("inbox");
                setActiveView("chat");
              }}
            />
            <ModuleButton
              icon={FolderOpen}
              label="Teams"
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

      <section className="flex min-w-0 flex-col bg-[var(--nav-list,transparent)]">
        <div className="flex h-11 items-center gap-1 border-b border-border px-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Hide sidebar"
                  onClick={() => setNavCollapsed(true)}
                />
              }
            >
              <ChevronLeft />
            </TooltipTrigger>
            <TooltipContent>Hide sidebar</TooltipContent>
          </Tooltip>
          <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-muted px-2 transition-colors focus-within:border-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <AiWorkingDot active={agentWorking || storedAgentWorking} />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Search all"
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
                  aria-label="New chat"
                  onClick={() => void handleNewSession()}
                />
              }
            >
              <Plus />
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
                  disabled={!sessionId}
                  aria-label="Archive chat"
                  onClick={handleArchiveSession}
                />
              }
            >
              <Archive />
            </TooltipTrigger>
            <TooltipContent>Archive chat</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <QueuePanel query={query} />
        </ScrollArea>
      </section>
    </div>
  );
}
