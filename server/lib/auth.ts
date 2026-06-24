import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export type AuthMethod = "api_key" | "browser";
export type AuthProvider = "cursor" | "openai";

export interface AuthSession {
  id: string;
  provider: AuthProvider;
  method: AuthMethod;
  cursorApiKey?: string;
  openaiApiKey?: string;
  email?: string;
  model?: string;
  createdAt: number;
}

const SESSION_COOKIE = "nexus_session";
const sessions = new Map<string, AuthSession>();
const dataDir = path.join(process.cwd(), ".data");
const sessionsFile = path.join(dataDir, "sessions.json");

let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  try {
    await mkdir(dataDir, { recursive: true });
    const raw = await readFile(sessionsFile, "utf8");
    const parsed = JSON.parse(raw) as AuthSession[];
    for (const session of parsed) {
      sessions.set(session.id, session);
    }
  } catch {
    // no persisted sessions yet
  }
  loaded = true;
}

async function persistSessions() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sessionsFile, JSON.stringify([...sessions.values()], null, 2));
}

export async function createSession(
  data: Omit<AuthSession, "id" | "createdAt">,
): Promise<AuthSession> {
  await ensureLoaded();
  const session: AuthSession = {
    ...data,
    id: randomBytes(24).toString("hex"),
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  await persistSessions();
  return session;
}

export async function getSession(id: string | undefined): Promise<AuthSession | null> {
  if (!id) return null;
  await ensureLoaded();
  return sessions.get(id) ?? null;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<AuthSession, "id" | "createdAt">>,
): Promise<AuthSession | null> {
  await ensureLoaded();
  const existing = sessions.get(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  sessions.set(id, next);
  await persistSessions();
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  await ensureLoaded();
  sessions.delete(id);
  await persistSessions();
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function getSessionIdFromCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export async function resolveCursorApiKey(c: Context): Promise<string | null> {
  const sessionId = getSessionIdFromCookie(c);
  const session = await getSession(sessionId);
  if (session?.cursorApiKey) return session.cursorApiKey;
  if (process.env.CURSOR_API_KEY) return process.env.CURSOR_API_KEY;
  return null;
}

export async function getAuthStatus(c: Context) {
  const sessionId = getSessionIdFromCookie(c);
  const session = await getSession(sessionId);
  const devOverride = Boolean(process.env.CURSOR_API_KEY);

  if (session?.cursorApiKey) {
    return {
      connected: true,
      provider: session.provider,
      method: session.method,
      email: session.email,
      model: session.model ?? process.env.CURSOR_MODEL ?? "composer-2.5",
      devOverride: false,
    };
  }

  if (devOverride) {
    return {
      connected: true,
      provider: "cursor" as const,
      method: "api_key" as const,
      email: "Development override",
      model: process.env.CURSOR_MODEL ?? "composer-2.5",
      devOverride: true,
    };
  }

  return {
    connected: false,
    provider: null,
    method: null,
    email: null,
    model: process.env.CURSOR_MODEL ?? "composer-2.5",
    devOverride: false,
  };
}
