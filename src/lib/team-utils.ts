import type { TeamMember } from "@/types";

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function findMemberByAssignee(
  members: TeamMember[],
  assignee?: string,
): TeamMember | undefined {
  if (!assignee) return undefined;
  return members.find((m) => m.name === assignee);
}
