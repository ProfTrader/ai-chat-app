import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useShellStore } from "@/stores/shell-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
import type { ViewType } from "@/types";

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setActiveView } = useShellStore();
  const { setProjectId, setSessionId, selectTask, selectContact } =
    useSelectionStore();
  const { projects, sessions, tasks, contacts } = useDataStore();

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
          <CommandItem onSelect={() => navigate("tasks")}>Go to Tasks</CommandItem>
          <CommandItem onSelect={() => navigate("board")}>Go to Board</CommandItem>
          <CommandItem onSelect={() => navigate("contacts")}>Go to Contacts</CommandItem>
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
          {tasks.slice(0, 8).map((task) => (
            <CommandItem
              key={task.id}
              onSelect={() => {
                selectTask(task);
                setActiveView("tasks");
                setCommandOpen(false);
              }}
            >
              {task.identifier} — {task.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Contacts">
          {contacts.slice(0, 8).map((contact) => (
            <CommandItem
              key={contact.id}
              onSelect={() => {
                selectContact(contact);
                setActiveView("contacts");
                setCommandOpen(false);
              }}
            >
              {contact.name} — {contact.company}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
