import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Map,
  PanelRightOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { findMemberByAssignee } from "@/lib/team-utils";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { RoadmapItem, TaskActivity } from "@/types";

function dayLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function ActivityIcon({ type }: { type: TaskActivity["type"] }) {
  if (type === "status_changed") return <CheckCircle2 className="size-4 text-success" />;
  if (type === "roadmap_item_linked") return <Map className="size-4 text-active" />;
  if (type === "brief_task_applied") return <PanelRightOpen className="size-4 text-active" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

function DailyLedger({
  activities,
}: {
  activities: TaskActivity[];
}) {
  const grouped = useMemo(() => {
    return activities.reduce<Record<string, TaskActivity[]>>((acc, activity) => {
      const key = activity.createdAt.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), activity];
      return acc;
    }, {});
  }, [activities]);

  const days = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {days.map(([day, items]) => {
        const completed = items.filter((item) => item.type === "status_changed").length;
        const pending = items.length - completed;

        return (
          <section key={day} className="rounded-md border border-border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{dayLabel(day)}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{completed} done</Badge>
                <Badge variant="outline">{pending} pending</Badge>
              </div>
            </div>
            <div className="divide-y divide-border">
              {items.map((activity) => (
                <div key={activity.id} className="grid gap-3 px-4 py-3 md:grid-cols-[20px_1fr_auto]">
                  <ActivityIcon type={activity.type} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{activity.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{activity.actor}</Badge>
                    <span>{new Date(activity.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
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
        <Clock3 className="size-3.5" />
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
  const [view, setView] = useState<"ledger" | "roadmap">("ledger");
  const { projectId } = useSelectionStore();
  const { taskActivities, roadmapItems, tasks } = useDataStore();
  const projectActivities = taskActivities.filter((activity) => activity.projectId === projectId);
  const projectRoadmap = roadmapItems.filter((item) => item.projectId === projectId);
  const completed = tasks.filter((task) => task.projectId === projectId && task.status === "done").length;
  const pending = tasks.filter((task) => task.projectId === projectId && task.status !== "done").length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-shell">
      <div className="border-b border-border bg-pane px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project timeline
            </p>
            <h1 className="mt-1 text-xl font-semibold">Daily ledger and roadmap</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{completed} done</Badge>
            <Badge variant="outline">{pending} pending</Badge>
            <div className="flex rounded-md border border-border bg-background p-1">
              <Button
                variant={view === "ledger" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("ledger")}
                className={cn(view === "ledger" && "shadow-xs")}
              >
                Daily ledger
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-5">
          {view === "ledger" ? (
            <DailyLedger activities={projectActivities} />
          ) : (
            <RoadmapView items={projectRoadmap} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
