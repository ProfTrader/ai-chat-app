import Database from "@tauri-apps/plugin-sql";
import {
  mockContacts,
  mockMessages,
  mockProjects,
  mockSessions,
  mockTasks,
  mockWorkspaces,
} from "@/lib/mock-data";
import type {
  Contact,
  Message,
  Project,
  Session,
  Task,
  Workspace,
} from "@/types";

const DB_URL = "sqlite:crm.db";

let db: Database | null = null;

async function getDb() {
  if (!db) {
    db = await Database.load(DB_URL);
  }
  return db;
}

export async function initDatabase() {
  const database = await getDb();

  await database.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      identifier TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      priority TEXT,
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      last_activity TEXT NOT NULL,
      notes TEXT
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

export async function seedDatabase() {
  const database = await getDb();

  for (const ws of mockWorkspaces) {
    await database.execute(
      "INSERT OR IGNORE INTO workspaces (id, name) VALUES ($1, $2)",
      [ws.id, ws.name],
    );
  }

  for (const p of mockProjects) {
    await database.execute(
      "INSERT OR IGNORE INTO projects (id, workspace_id, name, slug) VALUES ($1, $2, $3, $4)",
      [p.id, p.workspaceId, p.name, p.slug],
    );
  }

  for (const t of mockTasks) {
    await database.execute(
      `INSERT OR IGNORE INTO tasks
       (id, project_id, identifier, title, status, description, assignee, priority, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        t.id,
        t.projectId,
        t.identifier,
        t.title,
        t.status,
        t.description ?? null,
        t.assignee ?? null,
        t.priority ?? null,
        t.dueDate ?? null,
        t.createdAt,
        t.updatedAt,
      ],
    );
  }

  for (const c of mockContacts) {
    await database.execute(
      `INSERT OR IGNORE INTO contacts
       (id, project_id, name, company, email, phone, last_activity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        c.id,
        c.projectId,
        c.name,
        c.company,
        c.email ?? null,
        c.phone ?? null,
        c.lastActivity,
        c.notes ?? null,
      ],
    );
  }

  for (const s of mockSessions) {
    await database.execute(
      "INSERT OR IGNORE INTO sessions (id, project_id, title, pinned, updated_at) VALUES ($1, $2, $3, $4, $5)",
      [s.id, s.projectId, s.title, s.pinned ? 1 : 0, s.updatedAt],
    );
  }

  for (const m of mockMessages) {
    await database.execute(
      "INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)",
      [m.id, m.sessionId, m.role, m.content, m.createdAt],
    );
  }
}

export async function insertMessage(message: Message) {
  const database = await getDb();
  await database.execute(
    "INSERT INTO messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)",
    [message.id, message.sessionId, message.role, message.content, message.createdAt],
  );
  await database.execute(
    "UPDATE sessions SET updated_at = $1 WHERE id = $2",
    [new Date().toISOString(), message.sessionId],
  );
}

export async function insertSession(session: Session) {
  const database = await getDb();
  await database.execute(
    "INSERT INTO sessions (id, project_id, title, pinned, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [session.id, session.projectId, session.title, session.pinned ? 1 : 0, session.updatedAt],
  );
}

export async function updateSessionTitleDb(sessionId: string, title: string) {
  const database = await getDb();
  await database.execute(
    "UPDATE sessions SET title = $1, updated_at = $2 WHERE id = $3",
    [title, new Date().toISOString(), sessionId],
  );
}

export async function updateTaskStatusDb(id: string, status: Task["status"]) {
  const database = await getDb();
  await database.execute(
    "UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3",
    [status, new Date().toISOString(), id],
  );
}

export async function loadAllData(): Promise<{
  workspaces: Workspace[];
  projects: Project[];
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
}> {
  const database = await getDb();

  const workspaces = await database.select<Workspace[]>(
    "SELECT id, name FROM workspaces",
  );

  const projectRows = await database.select<
    { id: string; workspace_id: string; name: string; slug: string }[]
  >("SELECT id, workspace_id, name, slug FROM projects");

  const taskRows = await database.select<
    {
      id: string;
      project_id: string;
      identifier: string;
      title: string;
      status: string;
      description: string | null;
      assignee: string | null;
      priority: string | null;
      due_date: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >("SELECT * FROM tasks");

  const contactRows = await database.select<
    {
      id: string;
      project_id: string;
      name: string;
      company: string;
      email: string | null;
      phone: string | null;
      last_activity: string;
      notes: string | null;
    }[]
  >("SELECT * FROM contacts");

  const sessionRows = await database.select<
    {
      id: string;
      project_id: string;
      title: string;
      pinned: number;
      updated_at: string;
    }[]
  >("SELECT * FROM sessions");

  const messageRows = await database.select<
    {
      id: string;
      session_id: string;
      role: string;
      content: string;
      created_at: string;
    }[]
  >("SELECT * FROM messages ORDER BY created_at ASC");

  return {
    workspaces,
    projects: projectRows.map((p) => ({
      id: p.id,
      workspaceId: p.workspace_id,
      name: p.name,
      slug: p.slug,
    })),
    tasks: taskRows.map((t) => ({
      id: t.id,
      projectId: t.project_id,
      identifier: t.identifier,
      title: t.title,
      status: t.status as Task["status"],
      description: t.description ?? undefined,
      assignee: t.assignee ?? undefined,
      priority: (t.priority as Task["priority"]) ?? undefined,
      dueDate: t.due_date ?? undefined,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
    contacts: contactRows.map((c) => ({
      id: c.id,
      projectId: c.project_id,
      name: c.name,
      company: c.company,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      lastActivity: c.last_activity,
      notes: c.notes ?? undefined,
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      projectId: s.project_id,
      title: s.title,
      pinned: Boolean(s.pinned),
      updatedAt: s.updated_at,
    })),
    messages: messageRows.map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role as Message["role"],
      content: m.content,
      createdAt: m.created_at,
    })),
  };
}
