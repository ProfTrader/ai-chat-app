export type TaskStatus = "todo" | "in_progress" | "done";

export interface Workspace {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
}

export interface Task {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  status: TaskStatus;
  description?: string;
  assignee?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type PresenceStatus = "online" | "away" | "busy" | "offline";

export interface Contact {
  id: string;
  projectId: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  lastActivity: string;
  notes?: string;
  avatarUrl?: string;
  status?: PresenceStatus;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  status?: PresenceStatus;
}

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  workspace: string;
  bio?: string;
  avatarUrl: string;
  status: PresenceStatus;
}

export type ViewType = "chat" | "tasks" | "contacts" | "board" | "nodes";

export interface ContextChip {
  id: string;
  label: string;
  type: "task" | "contact" | "project" | "file";
}

export type ComposerMode = "plan" | "auto";
