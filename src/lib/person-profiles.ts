import { mockContacts, mockTeamMembers } from "@/lib/mock-data";
import type { Contact, TeamMember } from "@/types";

export function enrichContact(contact: Contact): Contact {
  const seed = mockContacts.find((item) => item.id === contact.id);
  if (!seed) return contact;

  return {
    ...contact,
    avatarUrl: contact.avatarUrl ?? seed.avatarUrl,
    status: contact.status ?? seed.status,
  };
}

export function enrichTeamMember(member: TeamMember): TeamMember {
  const seed = mockTeamMembers.find((item) => item.id === member.id);
  if (!seed) return member;

  return {
    ...member,
    avatarUrl: member.avatarUrl ?? seed.avatarUrl,
    status: member.status ?? seed.status,
  };
}

export function enrichContacts(contacts: Contact[]): Contact[] {
  return contacts.map(enrichContact);
}

export function enrichTeamMembers(members: TeamMember[]): TeamMember[] {
  return members.map(enrichTeamMember);
}
