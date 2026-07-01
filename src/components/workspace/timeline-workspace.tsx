import { useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Circle,
  GitBranch,
  GitCommitHorizontal,
  Map,
  PanelRightOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { findMemberByAssignee } from "@/lib/team-utils";
import { WORKSPACE_EVENT_SOURCE_LABEL } from "@/lib/workspace/harness";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { RoadmapItem, TaskActivity, WorkspaceEvent, WorkspaceEventSource } from "@/types";

type MonitorEntry =
  | { kind: "workspace"; timestamp: string; event: WorkspaceEvent }
  | { kind: "task"; timestamp: string; activity: TaskActivity };

function dayLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventIcon(entry: MonitorEntry) {
  if (entry.kind === "task") {
    if (entry.activity.type === "status_changed") return <CheckCircle2 className="size-4 text-success" />;
    if (entry.activity.type === "roadmap_item_linked") return <Map className="size-4 text-active" />;
    if (entry.activity.type === "brief_task_applied") return <PanelRightOpen className="size-4 text-active" />;
    return <Circle className="size-4 text-muted-foreground" />;
  }
  if (entry.event.type === "branch_created" || entry.event.type === "review_requested") {
    return <GitBranch className="size-4 text-active" />;
  }
  if (entry.event.type === "head_promoted") {
    return <GitCommitHorizontal className="size-4 text-success" />;
  }
  return <Activity className="size-4 text-muted-foreground" />;
}

function sourceTone(source: WorkspaceEventSource) {
  if (source === "slack") return "border-[#4a154b]/30 bg-[#4a154b]/10 text-[#4a154b]";
  if (source === "github") return "border-foreground/20 bg-foreground/10 text-foreground";
  if (source === "webhook") return "border-active/30 bg-active-soft text-active";
  if (source === "nexus") return "border-fin/30 bg-fin/10 text-fin";
  return "border-border text-muted-foreground";
}

function MonitorLedger({
  entries,
  onOpenBranch,
}: {
  entries: MonitorEntry[];
  onOpenBranch: (worktreeId: string) => void;
}) {
  const grouped = useMemo(() => {
    return entries.reduce<Record<string, MonitorEntry[]>>((acc, entry) => {
      const key = entry.timestamp.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), entry];
      return acc;
    }, {});
  }, [entries]);

  const days = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  if (entries.length === 0) {
    return (
      <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
        No monitor events yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(([day, items]) => (
        <section key={day} className="rounded-md border border-border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{dayLabel(day)}</h2>
            </div>
            <Badge variant="outline">{items.length} events</Badge>
          </div>
          <div className="divide-y divide-border">
            {items
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .map((entry) => {
                const key = entry.kind === "workspace" ? entry.event.id : entry.activity.id;
                const title = entry.kind === "workspace" ? entry.event.title : entry.activity.title;
                const body = entry.kind === "workspace" ? entry.event.body : entry.activity.description;
                const source = entry.kind === "workspace" ? entry.event.source : "nexus";
                const worktreeId =
                  entry.kind === "workspace" ? entry.event.worktreeId : undefined;
                const externalUrl =
                  entry.kind === "workspace" ? entry.event.externalUrl : undefined;
                return (
                  <div
                    key={key}
                    role={worktreeId ? "button" : undefined}
                    tabIndex={worktreeId ? 0 : undefined}
                    onClick={worktreeId ? () => onOpenBranch(worktreeId) : undefined}
                    onKeyDown={
                      worktreeId
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onOpenBranch(worktreeId);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "grid gap-3 px-4 py-3 md:grid-cols-[20px_1fr_auto]",
                      worktreeId &&
                        "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    )}
                  >
                    {eventIcon(entry)}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {title}
                        {worktreeId ? (
                          <GitBranch className="ml-1.5 inline size-3 text-muted-foreground" />
                        ) : null}
                      </p>
                      {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
                      {externalUrl ? (
                        <a
                          href={externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-1 inline-block text-xs text-active hover:underline"
                        >
                          View source
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className={cn("font-normal", sourceTone(source))}>
                        {WORKSPACE_EVENT_SOURCE_LABEL[source]}
                      </Badge>
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function RoadmapCard({
  item,
  ownerAvatarUrl,
}: {
  item: RoadmapItem;
  ownerAvatarUrl?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.horizon === "short_term" ? "secondary" : "outline"}>
              {item.horizon === "short_term" ? "Short term" : "Long term"}
            </Badge>
            <Badge variant={item.status === "active" ? "default" : "outline"}>
              {item.status}
            </Badge>
          </div>
          <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
        {item.owner ? (
          <PersonAvatar
            name={item.owner}
            avatarUrl={ownerAvatarUrl}
            size="sm"
            shape="square"
          />
        ) : null}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Map className="size-3.5" />
        <span>{item.linkedTaskIds.length} linked task{item.linkedTaskIds.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

function RoadmapView({ items }: { items: RoadmapItem[] }) {
  const shortTerm = items.filter((item) => item.horizon === "short_term");
  const longTerm = items.filter((item) => item.horizon === "long_term");
  const { projectId } = useSelectionStore();
  const getTeamMembersByProject = useDataStore((state) => state.getTeamMembersByProject);
  const members = useMemo(
    () => getTeamMembersByProject(projectId),
    [getTeamMembersByProject, projectId],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Short-term goals</h2>
          <Badge variant="secondary">{shortTerm.length}</Badge>
        </div>
        <div className="space-y-3">
          {shortTerm.map((item) => {
            const owner = item.owner ? findMemberByAssignee(members, item.owner) : undefined;
            return <RoadmapCard key={item.id} item={item} ownerAvatarUrl={owner?.avatarUrl} />;
          })}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Long-term vision</h2>
          <Badge variant="outline">{longTerm.length}</Badge>
        </div>
        <div className="space-y-3">
          {longTerm.map((item) => {
            const owner = item.owner ? findMemberByAssignee(members, item.owner) : undefined;
            return <RoadmapCard key={item.id} item={item} ownerAvatarUrl={owner?.avatarUrl} />;
          })}
        </div>
      </section>
    </div>
  );
}

export function TimelineWorkspace() {
  const [view, setView] = useState<"monitor" | "roadmap">("monitor");
  const [activeSources, setActiveSources] = useState<Set<WorkspaceEventSource>>(new Set());
  const { projectId, selectWorktree } = useSelectionStore();
  const setActiveView = useShellStore((state) => state.setActiveView);
  const { taskActivities, roadmapItems, tasks, workspaceEvents } = useDataStore();
  const projectActivities = taskActivities.filter((activity) => activity.projectId === projectId);
  const projectEvents = workspaceEvents.filter((event) => event.projectId === projectId);
  const projectRoadmap = roadmapItems.filter((item) => item.projectId === projectId);
  const completed = tasks.filter((task) => task.projectId === projectId && !task.worktreeId && task.status === "done").length;
  const pending = tasks.filter((task) => task.projectId === projectId && !task.worktreeId && task.status !== "done").length;

  const allEntries: MonitorEntry[] = [
    ...projectEvents.map((event) => ({ kind: "workspace" as const, timestamp: event.createdAt, event })),
    ...projectActivities.map((activity) => ({ kind: "task" as const, timestamp: activity.createdAt, activity })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Sources present in this project's ledger, ordered for stable chips.
  const availableSources = useMemo(() => {
    const set = new Set<WorkspaceEventSource>(
      projectActivities.length > 0 ? ["nexus"] : [],
    );
    for (const event of projectEvents) set.add(event.source);
    return Array.from(set);
  }, [projectEvents, projectActivities.length]);

  const entrySource = (entry: MonitorEntry): WorkspaceEventSource =>
    entry.kind === "workspace" ? entry.event.source : "nexus";
  const entries =
    activeSources.size === 0
      ? allEntries
      : allEntries.filter((entry) => activeSources.has(entrySource(entry)));

  const toggleSource = (source: WorkspaceEventSource) =>
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });

  const openBranch = (worktreeId: string) => {
    selectWorktree(worktreeId);
    setActiveView("files");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-shell">
      <div className="border-b border-border bg-pane px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Team monitor
            </p>
            <h1 className="mt-1 text-xl font-semibold">Events, branches, and roadmap</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{completed} done</Badge>
            <Badge variant="outline">{pending} pending</Badge>
            <div className="flex rounded-md border border-border bg-background p-1">
              <Button
                variant={view === "monitor" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("monitor")}
                className={cn(view === "monitor" && "shadow-xs")}
              >
                Monitor
              </Button>
              <Button
                variant={view === "roadmap" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("roadmap")}
              >
                Roadmap
              </Button>
            </div>
          </div>
        </div>
      </div>
      {view === "monitor" && availableSources.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-pane px-5 py-2.5">
          <span className="text-xs text-muted-foreground">Sources</span>
          {availableSources.map((source) => {
            const active = activeSources.size === 0 || activeSources.has(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors",
                  active ? sourceTone(source) : "border-border text-muted-foreground opacity-60",
                )}
              >
                {WORKSPACE_EVENT_SOURCE_LABEL[source]}
              </button>
            );
          })}
          {activeSources.size > 0 ? (
            <button
              type="button"
              onClick={() => setActiveSources(new Set())}
              className="text-xs text-active hover:underline"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-5">
          {view === "monitor" ? (
            <MonitorLedger entries={entries} onOpenBranch={openBranch} />
          ) : (
            <RoadmapView items={projectRoadmap} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
