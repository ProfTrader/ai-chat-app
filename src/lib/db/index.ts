import Database from "@tauri-apps/plugin-sql";
import type {
  Contact,
  Message,
  Project,
  ResearchDoc,
  Session,
  Task,
  Workspace,
} from "@/types";
import { tradeifyResearchDocs } from "@/lib/research/tradeify-seed";

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

  await database.execute(`
    CREATE TABLE IF NOT EXISTS research_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      entity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      source TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export async function seedDatabase() {
  const database = await getDb();

  // Seed a clean, mock-free starting workspace + project only.
  await database.execute(
    "INSERT OR IGNORE INTO workspaces (id, name) VALUES ($1, $2)",
    ["ws-1", "My Workspace"],
  );
  await database.execute(
    "INSERT OR IGNORE INTO projects (id, workspace_id, name, slug) VALUES ($1, $2, $3, $4)",
    ["proj-1", "ws-1", "General", "general"],
  );

  // Seed the Tradeify research corpus (idempotent via INSERT OR IGNORE).
  await bulkInsertResearchDocs(tradeifyResearchDocs);
}

export async function insertResearchDoc(doc: ResearchDoc) {
  const database = await getDb();
  await database.execute(
    `INSERT OR IGNORE INTO research_docs
      (id, project_id, kind, entity, title, summary, content, source_url, source, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      doc.id,
      doc.projectId,
      doc.kind,
      doc.entity,
      doc.title,
      doc.summary,
      doc.content,
      doc.sourceUrl ?? null,
      doc.source ?? null,
      JSON.stringify(doc.tags ?? []),
      doc.createdAt,
      doc.updatedAt,
    ],
  );
}

export async function bulkInsertResearchDocs(docs: ResearchDoc[]) {
  for (const doc of docs) {
    await insertResearchDoc(doc);
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
  researchDocs: ResearchDoc[];
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

  const researchRows = await database.select<
    {
      id: string;
      project_id: string;
      kind: string;
      entity: string;
      title: string;
      summary: string;
      content: string;
      source_url: string | null;
      source: string | null;
      tags: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >("SELECT * FROM research_docs ORDER BY kind ASC, entity ASC");

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
    researchDocs: researchRows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      kind: r.kind as ResearchDoc["kind"],
      entity: r.entity,
      title: r.title,
      summary: r.summary,
      content: r.content,
      sourceUrl: r.source_url ?? undefined,
      source: r.source ?? undefined,
      tags: parseTags(r.tags),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
