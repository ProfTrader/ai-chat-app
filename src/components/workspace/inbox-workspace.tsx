import { Bell, CheckCheck, Columns3, FileText, Inbox, Mail, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { NotificationType } from "@/types";

const typeIcon: Record<NotificationType, LucideIcon> = {
  task_assigned: UserCheck,
  flow_submitted: Columns3,
  brief_created: FileText,
  email_drafted: Mail,
  info: Bell,
};

const typeTint: Record<NotificationType, string> = {
  task_assigned: "bg-success/10 text-success",
  flow_submitted: "bg-active-soft text-active",
  brief_created: "bg-fin/10 text-fin",
  email_drafted: "bg-primary/10 text-foreground",
  info: "bg-muted text-muted-foreground",
};

export function InboxWorkspace() {
  const notifications = useDataStore((s) => s.notifications);
  const projects = useDataStore((s) => s.projects);
  const markNotificationRead = useDataStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useDataStore((s) => s.markAllNotificationsRead);
  const setProjectId = useSelectionStore((s) => s.setProjectId);
  const setActiveView = useShellStore((s) => s.setActiveView);

  const projectName = (id?: string) =>
    id ? projects.find((p) => p.id === id)?.name : undefined;

  const open = (notification: (typeof notifications)[number]) => {
    markNotificationRead(notification.id);
    if (notification.projectId) {
      setProjectId(notification.projectId);
      setActiveView("board");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-pane px-5 py-2.5">
        <p className="text-sm font-medium">Notifications</p>
        {notifications.some((n) => !n.read) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => markAllNotificationsRead()}
          >
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>You're all caught up</EmptyTitle>
              <EmptyDescription>
                Assignments, submitted flows, briefs, and drafts will land here as Dexter works.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            {notifications.map((notification) => {
              const Icon = typeIcon[notification.type];
              const target = projectName(notification.projectId);
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => open(notification)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50",
                    !notification.read && "bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                      typeTint[notification.type],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                    {notification.body && (
                      <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-muted-foreground">
                        {notification.body}
                      </span>
                    )}
                    {target && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {target}
                      </span>
                    )}
                  </span>
                  {!notification.read && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-active" aria-label="Unread" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
