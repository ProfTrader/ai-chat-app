import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { Contact } from "@/types";

function ContactRow({
  contact,
  isSelected,
}: {
  contact: Contact;
  isSelected: boolean;
}) {
  const selectContact = useSelectionStore((s) => s.selectContact);

  return (
    <button
      type="button"
      onClick={() => selectContact(contact)}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/50 px-5 py-3.5 text-left transition-colors",
        isSelected ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {contact.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">{contact.name}</p>
        <p className="truncate text-sm text-muted-foreground">{contact.company}</p>
      </div>
      <span className="shrink-0 text-sm text-muted-foreground">
        {contact.lastActivity}
      </span>
    </button>
  );
}

export function ContactList() {
  const { projectId, selectedContactId } = useSelectionStore();
  const getContactsByProject = useDataStore((s) => s.getContactsByProject);
  const contacts = getContactsByProject(projectId);

  if (contacts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-base text-muted-foreground">
        No contacts in this project yet.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-32">
        {contacts.map((contact) => (
          <ContactRow
            key={contact.id}
            contact={contact}
            isSelected={contact.id === selectedContactId}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
