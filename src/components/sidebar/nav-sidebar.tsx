import { useMemo } from "react";
import { ChevronRight, Pin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { Project, Session } from "@/types";

function formatRelativeTime(value: string) {
  return value;
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
}: {
  session: Session;
  isActive: boolean;
}) {
  const setSessionId = useSelectionStore((s) => s.setSessionId);

  return (
    <button
      type="button"
      onClick={() => setSessionId(session.id)}
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
      <span className="flex-1 truncate">{session.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground/70">
        {formatRelativeTime(session.updatedAt)}
      </span>
    </button>
  );
}

export function NavSidebar() {
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
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Workspace
        </p>
        <p className="mt-1 truncate text-base font-medium">Acme Corp</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
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
      </ScrollArea>
    </div>
  );
}
