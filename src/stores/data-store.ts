import { create } from "zustand";
import type {
  Contact,
  Message,
  Project,
  Session,
  Task,
  TaskStatus,
  TeamMember,
  Workspace,
} from "@/types";
import {
  mockContacts,
  mockMessages,
  mockProjects,
  mockSessions,
  mockTasks,
  mockTeamMembers,
  mockWorkspaces,
} from "@/lib/mock-data";

interface DataState {
  initialized: boolean;
  workspaces: Workspace[];
  projects: Project[];
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
  teamMembers: TeamMember[];
  initialize: () => Promise<void>;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "identifier">) => Promise<Task>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  addMessage: (sessionId: string, content: string, role?: Message["role"]) => Promise<Message>;
  persistChatMessage: (
    sessionId: string,
    content: string,
    role?: Message["role"],
    id?: string,
  ) => Promise<Message>;
  addSession: (projectId: string, title?: string) => Promise<Session>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  addProject: (name: string, workspaceId: string) => Promise<Project>;
  getTasksByProject: (projectId: string) => Task[];
  getContactsByProject: (projectId: string) => Contact[];
  getTeamMembersByProject: (projectId: string) => TeamMember[];
  getMessagesBySession: (sessionId: string) => Message[];
}

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function generateIdentifier(projectId: string, tasks: Task[]) {
  const prefix =
    projectId === "proj-1" ? "Q2" : projectId === "proj-2" ? "ENT" : "PRJ";
  const count = tasks.filter((t) => t.projectId === projectId).length + 1;
  return `${prefix}-${count}`;
}

async function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const useDataStore = create<DataState>((set, get) => ({
  initialized: false,
  workspaces: mockWorkspaces,
  projects: mockProjects,
  tasks: mockTasks,
  contacts: mockContacts,
  sessions: mockSessions,
  messages: mockMessages,
  teamMembers: mockTeamMembers,

  initialize: async () => {
    if (get().initialized) return;

    const tauri = await isTauriRuntime();
    if (tauri) {
      try {
        const { initDatabase, loadAllData } = await import("@/lib/db");
        await initDatabase();
        const data = await loadAllData();
        if (data.tasks.length > 0) {
          set({ ...data, initialized: true });
          return;
        }
        const { seedDatabase } = await import("@/lib/db");
        await seedDatabase();
        const seeded = await loadAllData();
        set({ ...seeded, initialized: true });
        return;
      } catch (err) {
        console.warn("SQLite unavailable, using in-memory data:", err);
      }
    }

    const stored = localStorage.getItem("crm-data");
    if (stored) {
      try {
        const data = JSON.parse(stored) as Partial<DataState>;
        set({
          workspaces: data.workspaces ?? mockWorkspaces,
          projects: data.projects ?? mockProjects,
          tasks: data.tasks ?? mockTasks,
          contacts: data.contacts ?? mockContacts,
          sessions: data.sessions ?? mockSessions,
          messages: data.messages ?? mockMessages,
          teamMembers: mockTeamMembers,
          initialized: true,
        });
        return;
      } catch {
        // fall through
      }
    }

    set({ initialized: true });
  },

  addTask: async (input) => {
    const now = new Date().toISOString();
    const tasks = get().tasks;
    const task: Task = {
      ...input,
      id: generateId("task"),
      identifier: generateIdentifier(input.projectId, tasks),
      createdAt: now,
      updatedAt: now,
    };

    set({ tasks: [...tasks, task] });
    persistLocal(get());
    return task;
  },

  updateTaskStatus: async (id, status) => {
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t,
    );
    set({ tasks });

    if (await isTauriRuntime()) {
      try {
        const { updateTaskStatusDb } = await import("@/lib/db");
        await updateTaskStatusDb(id, status);
      } catch (err) {
        console.warn("Failed to persist task status:", err);
      }
    } else {
      persistLocal(get());
    }
  },

  addMessage: async (sessionId, content, role = "user") =>
    get().persistChatMessage(sessionId, content, role),

  persistChatMessage: async (sessionId, content, role = "user", id) => {
    const message: Message = {
      id: id ?? generateId("msg"),
      sessionId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };

    const messages = [...get().messages, message];
    const sessions = get().sessions.map((s) =>
      s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s,
    );

    set({ messages, sessions });

    if (await isTauriRuntime()) {
      try {
        const { insertMessage } = await import("@/lib/db");
        await insertMessage(message);
      } catch (err) {
        console.warn("Failed to persist message to SQLite:", err);
      }
    } else {
      persistLocal(get());
    }

    return message;
  },

  addSession: async (projectId, title = "New session") => {
    const session: Session = {
      id: generateId("session"),
      projectId,
      title: title.length > 48 ? `${title.slice(0, 45)}…` : title,
      pinned: false,
      updatedAt: new Date().toISOString(),
    };

    set({ sessions: [session, ...get().sessions] });

    if (await isTauriRuntime()) {
      try {
        const { insertSession } = await import("@/lib/db");
        await insertSession(session);
      } catch (err) {
        console.warn("Failed to persist session:", err);
      }
    } else {
      persistLocal(get());
    }

    return session;
  },

  updateSessionTitle: async (sessionId, title) => {
    const nextTitle = title.length > 48 ? `${title.slice(0, 45)}…` : title;
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId
          ? { ...session, title: nextTitle, updatedAt: new Date().toISOString() }
          : session,
      ),
    });

    if (await isTauriRuntime()) {
      try {
        const { updateSessionTitleDb } = await import("@/lib/db");
        await updateSessionTitleDb(sessionId, nextTitle);
      } catch (err) {
        console.warn("Failed to update session title:", err);
      }
    } else {
      persistLocal(get());
    }
  },

  addProject: async (name, workspaceId) => {
    const project: Project = {
      id: generateId("proj"),
      workspaceId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
    };
    set({ projects: [...get().projects, project] });
    persistLocal(get());
    return project;
  },

  getTasksByProject: (projectId) =>
    get().tasks.filter((t) => t.projectId === projectId),

  getContactsByProject: (projectId) =>
    get().contacts.filter((c) => c.projectId === projectId),

  getTeamMembersByProject: (projectId) =>
    get().teamMembers.filter((m) => m.projectId === projectId),

  getMessagesBySession: (sessionId) =>
    get().messages.filter((m) => m.sessionId === sessionId),
}));

function persistLocal(state: DataState) {
  const payload = {
    workspaces: state.workspaces,
    projects: state.projects,
    tasks: state.tasks,
    contacts: state.contacts,
    sessions: state.sessions,
    messages: state.messages,
  };
  localStorage.setItem("crm-data", JSON.stringify(payload));
}
