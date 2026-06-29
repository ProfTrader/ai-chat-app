import { useMemo, useState } from "react";
import {
  AtSign,
  Bell,
  CheckCheck,
  Columns3,
  FileText,
  Inbox,
  ListTodo,
  Mail,
  MessageSquare,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { findMemberByAssignee } from "@/lib/team-utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { NotificationType, TeamMember } from "@/types";

type InboxKind = "task" | "chat" | "notification";
type Priority = "low" | "medium" | "high";

interface InboxItem {
  id: string;
  kind: InboxKind;
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle?: string;
  projectId?: string;
  assignee?: string;
  priority?: Priority;
  unread: boolean;
  timestamp: string;
  open: () => void;
}

const notificationIcon: Record<NotificationType, LucideIcon> = {
  task_assigned: UserCheck,
  flow_submitted: Columns3,
  brief_created: FileText,
  email_drafted: Mail,
  mention: AtSign,
  info: Bell,
};

const notificationTint: Record<NotificationType, string> = {
  task_assigned: "bg-success/10 text-success",
  flow_submitted: "bg-active-soft text-active",
  brief_created: "bg-fin/10 text-fin",
  email_drafted: "bg-primary/10 text-foreground",
  mention: "bg-active-soft text-active",
  info: "bg-muted text-muted-foreground",
};

const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const priorityBadgeClass: Record<Priority, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-warning/30 bg-warning/10 text-warning",
  low: "border-border text-muted-foreground",
};

const kindOptions: { value: "all" | InboxKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "task", label: "Tasks" },
  { value: "chat", label: "Chats" },
  { value: "notification", label: "Alerts" },
];

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal capitalize", priorityBadgeClass[priority])}
    >
      {priority}
    </Badge>
  );
}

function InboxRow({
  item,
  assigneeMember,
  projectName,
}: {
  item: InboxItem;
  assigneeMember?: TeamMember;
  projectName?: string;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.open}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50",
        item.unread && "bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          item.tint,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.title}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTime(item.timestamp)}
          </span>
        </span>
        {item.subtitle ? (
          <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
            {item.subtitle}
          </span>
        ) : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.priority ? <PriorityBadge priority={item.priority} /> : null}
          {projectName ? (
            <Badge variant="secondary" className="font-normal">
              <Users data-icon="inline-start" />
              {projectName}
            </Badge>
          ) : null}
          {item.assignee ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <PersonAvatar
                name={assigneeMember?.name ?? item.assignee}
                avatarUrl={assigneeMember?.avatarUrl}
                status={assigneeMember?.status}
                size="sm"
                shape="square"
              />
              {assigneeMember?.name ?? item.assignee}
            </span>
          ) : null}
        </span>
      </span>
      {item.unread ? (
        <span
          className="mt-2 size-2 shrink-0 rounded-full bg-active"
          aria-label="Unread"
        />
      ) : null}
    </button>
  );
}

export function InboxWorkspace() {
  const notifications = useDataStore((s) => s.notifications);
  const projects = useDataStore((s) => s.projects);
  const tasks = useDataStore((s) => s.tasks);
  const sessions = useDataStore((s) => s.sessions);
  const messages = useDataStore((s) => s.messages);
  const teamMembers = useDataStore((s) => s.teamMembers);
  const markNotificationRead = useDataStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useDataStore((s) => s.markAllNotificationsRead);

  const workspaceId = useSelectionStore((s) => s.workspaceId);
  const setProjectId = useSelectionStore((s) => s.setProjectId);
  const selectTask = useSelectionStore((s) => s.selectTask);
  const setSessionId = useSelectionStore((s) => s.setSessionId);

  const setActiveView = useShellStore((s) => s.setActiveView);
  const setSidebarMode = useShellStore((s) => s.setSidebarMode);
  const notificationReadAt = useShellStore((s) => s.notificationReadAt);
  const notificationsInitializedAt = useShellStore((s) => s.notificationsInitializedAt);

  const [kindFilter, setKindFilter] = useState<"all" | InboxKind>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");

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

  const items = useMemo<InboxItem[]>(() => {
    const result: InboxItem[] = [];

    // Open tasks across the workspace — the actionable backlog.
    tasks
      .filter((task) => task.status !== "done" && workspaceProjectIds.has(task.projectId))
      .forEach((task) => {
        result.push({
          id: `task-${task.id}`,
          kind: "task",
          icon: ListTodo,
          tint:
            task.priority === "high"
              ? "bg-destructive/10 text-destructive"
              : "bg-active-soft text-active",
          title: task.title,
          subtitle: task.identifier
            ? `${task.identifier}${task.dueDate ? ` · due ${task.dueDate}` : ""}`
            : task.description,
          projectId: task.projectId,
          assignee: task.assignee,
          priority: task.priority,
          unread: false,
          timestamp: task.updatedAt,
          open: () => {
            setProjectId(task.projectId);
            setSidebarMode("projects");
            selectTask(task);
            setActiveView("board");
          },
        });
      });

    // Chat sessions with unread agent replies.
    const latestReplyBySession = new Map<string, string>();
    messages.forEach((message) => {
      if (message.role === "user") return;
      const previous = latestReplyBySession.get(message.sessionId);
      if (!previous || new Date(message.createdAt) > new Date(previous)) {
        latestReplyBySession.set(message.sessionId, message.createdAt);
      }
    });
    sessions
      .filter((session) => !session.archivedAt && workspaceProjectIds.has(session.projectId))
      .forEach((session) => {
        const timestamp = latestReplyBySession.get(session.id) ?? session.updatedAt;
        const seenAt =
          notificationReadAt[`session:${session.id}`] ?? notificationsInitializedAt;
        const unread = Boolean(
          notificationsInitializedAt &&
            seenAt &&
            new Date(timestamp).getTime() > new Date(seenAt).getTime(),
        );
        if (!unread) return;
        result.push({
          id: `chat-${session.id}`,
          kind: "chat",
          icon: MessageSquare,
          tint: "bg-primary/10 text-foreground",
          title: session.title,
          subtitle: "New reply in this conversation",
          projectId: session.projectId,
          unread: true,
          timestamp,
          open: () => {
            setProjectId(session.projectId);
            setSessionId(session.id);
            setSidebarMode("chat");
            setActiveView("chat");
          },
        });
      });

    // Notifications — assignments, briefs, drafts, flow submissions.
    notifications.forEach((notification) => {
      result.push({
        id: `notif-${notification.id}`,
        kind: "notification",
        icon: notificationIcon[notification.type],
        tint: notificationTint[notification.type],
        title: notification.title,
        subtitle: notification.body,
        projectId: notification.projectId,
        unread: !notification.read,
        timestamp: notification.createdAt,
        open: () => {
          markNotificationRead(notification.id);
          if (notification.projectId) {
            setProjectId(notification.projectId);
            setSidebarMode("projects");
            setActiveView("board");
          }
        },
      });
    });

    return result;
  }, [
    markNotificationRead,
    messages,
    notifications,
    notificationReadAt,
    notificationsInitializedAt,
    selectTask,
    sessions,
    setActiveView,
    setProjectId,
    setSessionId,
    setSidebarMode,
    tasks,
    workspaceProjectIds,
  ]);

  const kindCounts = useMemo(() => {
    const counts = { all: items.length, task: 0, chat: 0, notification: 0 };
    items.forEach((item) => {
      counts[item.kind] += 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => (kindFilter === "all" ? true : item.kind === kindFilter))
      .filter((item) => (projectFilter === "all" ? true : item.projectId === projectFilter))
      .filter((item) =>
        priorityFilter === "all" ? true : item.priority === priorityFilter,
      )
      .sort((a, b) => {
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        const priorityDelta =
          (a.priority ? priorityOrder[a.priority] : 3) -
          (b.priority ? priorityOrder[b.priority] : 3);
        if (priorityDelta !== 0) return priorityDelta;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [items, kindFilter, priorityFilter, projectFilter]);

  const unreadCount = items.filter((item) => item.unread).length;

  const memberForItem = (item: InboxItem) => {
    if (!item.assignee || !item.projectId) return undefined;
    return findMemberByAssignee(
      teamMembers.filter((member) => member.projectId === item.projectId),
      item.assignee,
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-pane px-5 py-2.5">
        <div className="mr-auto flex items-center gap-1">
          {kindOptions.map((option) => (
            <Button
              key={option.value}
              variant={kindFilter === option.value ? "secondary" : "ghost"}
              size="sm"
              className="font-normal"
              onClick={() => setKindFilter(option.value)}
            >
              {option.label}
              <Badge variant="outline" className="ml-1.5 font-normal">
                {kindCounts[option.value]}
              </Badge>
            </Button>
          ))}
        </div>
        <Select
          value={projectFilter}
          onValueChange={(value) => setProjectFilter(value ?? "all")}
        >
          <SelectTrigger size="sm" className="min-w-36">
            <SelectValue>
              {(value) =>
                value && value !== "all"
                  ? projectNameById.get(value as string) ?? "All teams"
                  : "All teams"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {workspaceProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(value) => setPriorityFilter(value as "all" | Priority)}
        >
          <SelectTrigger size="sm" className="min-w-32">
            <SelectValue>
              {(value) =>
                value && value !== "all"
                  ? `${(value as string).charAt(0).toUpperCase()}${(value as string).slice(1)}`
                  : "Any priority"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => markAllNotificationsRead()}
          >
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {filteredItems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0 ? "You're all caught up" : "Nothing matches these filters"}
              </EmptyTitle>
              <EmptyDescription>
                {items.length === 0
                  ? "Assigned tasks, unread conversations, briefs, and drafts will land here as the team and Dexter work."
                  : "Try a different team, priority, or item type to see more of your inbox."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            {filteredItems.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                assigneeMember={memberForItem(item)}
                projectName={item.projectId ? projectNameById.get(item.projectId) : undefined}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
