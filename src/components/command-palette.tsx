import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { enrichContact } from "@/lib/person-profiles";
import { findMemberByAssignee } from "@/lib/team-utils";
import { useShellStore } from "@/stores/shell-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
import type { ViewType } from "@/types";

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setActiveView, setSidebarMode } = useShellStore();
  const { setProjectId, setSessionId, selectTask, selectContact } =
    useSelectionStore();
  const { projects, sessions, tasks, contacts, getTeamMembersByProject } = useDataStore();

  const navigate = (view: ViewType) => {
    setActiveView(view);
    if (["files", "briefs", "tasks", "board", "contacts", "timeline"].includes(view)) {
      setSidebarMode("projects");
    }
    setCommandOpen(false);
  };

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search teams, threads, tasks, people..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Views">
          <CommandItem onSelect={() => navigate("chat")}>Go to Chat</CommandItem>
          <CommandItem onSelect={() => navigate("files")}>Go to Files</CommandItem>
          <CommandItem onSelect={() => navigate("briefs")}>Go to Briefs</CommandItem>
          <CommandItem onSelect={() => navigate("tasks")}>Go to Tasks</CommandItem>
          <CommandItem onSelect={() => navigate("board")}>Go to Board</CommandItem>
          <CommandItem onSelect={() => navigate("contacts")}>Go to Team</CommandItem>
          <CommandItem onSelect={() => navigate("timeline")}>Go to Monitor</CommandItem>
          <CommandItem onSelect={() => navigate("nodes")}>Go to Nodes</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Teams">
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              onSelect={() => {
                setProjectId(project.id);
                setSidebarMode("projects");
                setCommandOpen(false);
              }}
            >
              {project.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Sessions">
          {sessions.slice(0, 8).map((session) => (
            <CommandItem
              key={session.id}
              onSelect={() => {
                setProjectId(session.projectId);
                setSessionId(session.id);
                setActiveView("chat");
                setSidebarMode("projects");
                setCommandOpen(false);
              }}
            >
              {session.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tasks">
          {tasks.filter((task) => !task.worktreeId).slice(0, 8).map((task) => {
            const assignee = findMemberByAssignee(
              getTeamMembersByProject(task.projectId),
              task.assignee,
            );

            return (
              <CommandItem
                key={task.id}
                onSelect={() => {
                  setProjectId(task.projectId);
                  selectTask(task);
                  setActiveView("tasks");
                  setSidebarMode("projects");
                  setCommandOpen(false);
                }}
              >
                {assignee || task.assignee ? (
                  <PersonAvatar
                    name={assignee?.name ?? task.assignee ?? "Unassigned"}
                    avatarUrl={assignee?.avatarUrl}
                    status={assignee?.status}
                    size="sm"
                    shape="square"
                  />
                ) : null}
                {task.identifier} — {task.title}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Team and contacts">
          {contacts.slice(0, 8).map((contact) => {
            const profile = enrichContact(contact);

            return (
              <CommandItem
                key={contact.id}
                onSelect={() => {
                  setProjectId(contact.projectId);
                  selectContact(contact);
                  setActiveView("contacts");
                  setSidebarMode("projects");
                  setCommandOpen(false);
                }}
              >
                <PersonAvatar
                  name={profile.name}
                  avatarUrl={profile.avatarUrl}
                  status={profile.status}
                  size="sm"
                  shape="square"
                />
                {profile.name} — {profile.company}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
