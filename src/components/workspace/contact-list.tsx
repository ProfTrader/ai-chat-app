import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Users } from "lucide-react";
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
      <Avatar className="size-10 shrink-0">
        <AvatarFallback>
          {contact.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
        </AvatarFallback>
      </Avatar>
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
      <div className="flex h-full items-center justify-center px-6 pb-32">
        <Empty className="max-w-md border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No contacts yet</EmptyTitle>
            <EmptyDescription>
              Contacts for this project will appear here once you add them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
