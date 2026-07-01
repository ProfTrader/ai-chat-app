import type {
  RoleCapability,
  Task,
  TeamRole,
  WorkspaceEventSource,
  WorkspaceMember,
} from "@/types";
import type { Worktree } from "@/lib/worktree/client";

const ROLE_CAPABILITIES: Record<TeamRole, RoleCapability[]> = {
  owner: [
    "manage_workspace",
    "manage_integrations",
    "manage_roles",
    "approve_worktree",
    "request_worktree_review",
    "stage_work",
    "read_workspace",
  ],
  lead: ["approve_worktree", "request_worktree_review", "stage_work", "read_workspace"],
  member: ["request_worktree_review", "stage_work", "read_workspace"],
  viewer: ["read_workspace"],
};

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  lead: "Lead",
  member: "Member",
  viewer: "Viewer",
};

export const WORKSPACE_EVENT_SOURCE_LABEL: Record<WorkspaceEventSource, string> = {
  nexus: "Nexus",
  system: "System",
  nexus_chat: "Nexus chat",
  webhook: "Webhook",
  slack: "Slack",
  github: "GitHub",
  email: "Email",
};

export function canRolePerform(role: TeamRole, capability: RoleCapability) {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function effectiveRoleForUser({
  workspaceId,
  userId,
  members,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
}): TeamRole {
  return (
    members.find((member) => member.workspaceId === workspaceId && member.userId === userId)
      ?.role ?? "viewer"
  );
}

export function canonicalTasksForProject(tasks: Task[], projectId: string) {
  return tasks.filter((task) => task.projectId === projectId && !task.worktreeId);
}

export function stagedTasksForWorktree(tasks: Task[], worktreeId: string) {
  return tasks.filter((task) => task.worktreeId === worktreeId);
}

export function normalizeWorktree(worktree: Worktree): Worktree {
  return {
    ...worktree,
    datasetIds: worktree.datasetIds ?? [],
    fileIds: worktree.fileIds ?? [],
    stagedTaskIds: worktree.stagedTaskIds ?? [],
    reviewers: worktree.reviewers ?? [],
  };
}
