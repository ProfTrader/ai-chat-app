import { ScrollArea } from "@/components/ui/scroll-area";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { Badge } from "@/components/ui/badge";
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
import type { Contact, TeamMember } from "@/types";

function TeamMemberRow({
  member,
  isSelected,
}: {
  member: TeamMember;
  isSelected: boolean;
}) {
  const selectMember = useSelectionStore((s) => s.selectMember);

  return (
    <button
      type="button"
      onClick={() => selectMember(member)}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/50 px-5 py-3.5 text-left transition-colors",
        isSelected ? "bg-active-soft" : "hover:bg-muted",
      )}
    >
      <PersonAvatar
        name={member.name}
        avatarUrl={member.avatarUrl}
        status={member.status}
        size="lg"
        shape="square"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">{member.name}</p>
        <p className="truncate text-sm text-muted-foreground">{member.role}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 font-normal">
        Internal
      </Badge>
    </button>
  );
}

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
        isSelected ? "bg-active-soft" : "hover:bg-muted",
      )}
    >
      <PersonAvatar
        name={contact.name}
        avatarUrl={contact.avatarUrl}
        status={contact.status}
        size="lg"
        shape="square"
        className="shrink-0"
      />
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
  const { projectId, selectedContactId, selectedMemberId } = useSelectionStore();
  const getContactsByProject = useDataStore((s) => s.getContactsByProject);
  const getTeamMembersByProject = useDataStore((s) => s.getTeamMembersByProject);
  const contacts = getContactsByProject(projectId);
  const members = getTeamMembersByProject(projectId);

  if (contacts.length === 0 && members.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 pb-32">
        <Empty className="max-w-md border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No team yet</EmptyTitle>
            <EmptyDescription>
              Project teammates and external contacts will appear here once you add them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-32">
        {members.length > 0 ? (
          <>
            <div className="border-b border-border/50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project team
            </div>
            {members.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                isSelected={member.id === selectedMemberId}
              />
            ))}
          </>
        ) : null}
        {contacts.length > 0 ? (
          <div className="border-b border-border/50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            External contacts
          </div>
        ) : null}
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
