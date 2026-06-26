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
  const { commandOpen, setCommandOpen, setActiveView } = useShellStore();
  const { setProjectId, setSessionId, selectTask, selectContact } =
    useSelectionStore();
  const { projects, sessions, tasks, contacts, getTeamMembersByProject } = useDataStore();

  const navigate = (view: ViewType) => {
    setActiveView(view);
    setCommandOpen(false);
  };

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search projects, tasks, contacts..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Views">
          <CommandItem onSelect={() => navigate("chat")}>Go to Chat</CommandItem>
          <CommandItem onSelect={() => navigate("briefs")}>Go to Briefs</CommandItem>
          <CommandItem onSelect={() => navigate("tasks")}>Go to Tasks</CommandItem>
          <CommandItem onSelect={() => navigate("board")}>Go to Board</CommandItem>
          <CommandItem onSelect={() => navigate("contacts")}>Go to Contacts</CommandItem>
          <CommandItem onSelect={() => navigate("timeline")}>Go to Timeline</CommandItem>
          <CommandItem onSelect={() => navigate("nodes")}>Go to Nodes</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Projects">
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              onSelect={() => {
                setProjectId(project.id);
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
                setSessionId(session.id);
                setActiveView("chat");
                setCommandOpen(false);
              }}
            >
              {session.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tasks">
          {tasks.slice(0, 8).map((task) => {
            const assignee = findMemberByAssignee(
              getTeamMembersByProject(task.projectId),
              task.assignee,
            );

            return (
              <CommandItem
                key={task.id}
                onSelect={() => {
                  selectTask(task);
                  setActiveView("tasks");
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
        <CommandGroup heading="Contacts">
          {contacts.slice(0, 8).map((contact) => {
            const profile = enrichContact(contact);

            return (
              <CommandItem
                key={contact.id}
                onSelect={() => {
                  selectContact(contact);
                  setActiveView("contacts");
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
