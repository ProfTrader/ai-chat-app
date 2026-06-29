import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export type AuthMethod = "api_key" | "browser";
import {
  resolveOllamaModel,
  validateOllamaModel,
} from "./ollama.js";

export type AuthProvider = "cursor" | "openai" | "moonshot" | "ollama";

export interface AuthSession {
  id: string;
  provider: AuthProvider;
  method: AuthMethod;
  cursorApiKey?: string;
  openaiApiKey?: string;
  moonshotApiKey?: string;
  email?: string;
  model?: string;
  createdAt: number;
}

const SESSION_COOKIE = "nexus_session";
const sessions = new Map<string, AuthSession>();
const dataDir = path.join(process.cwd(), ".data");
const sessionsFile = path.join(dataDir, "sessions.json");
const DEFAULT_MOONSHOT_MODEL = "kimi-k2.7-code";
const FAST_MOONSHOT_MODEL = "kimi-k2.7-code-highspeed";
const MOONSHOT_MODEL_ALIASES: Record<string, string> = {
  "kimi-k2.7": DEFAULT_MOONSHOT_MODEL,
  "kimi-k2.7-fast": FAST_MOONSHOT_MODEL,
  "kimi-k2.7-highspeed": FAST_MOONSHOT_MODEL,
};

const FAST_INTENT =
  /\b(fast|quick|quickly|brief|short|concise|summari[sz]e|summary|tl;?dr|simple answer|one[- ]liner)\b/i;
const REASONING_INTENT =
  /\b(reason|reasoning|think|thinking|deep|careful|carefully|analy[sz]e|analysis|investigate|debug|diagnose|architect|design|plan|strategy|compare|trade[- ]offs?|why|root cause|step[- ]by[- ]step|code|implement|build|refactor)\b/i;

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

export async function resolveMoonshotApiKey(c: Context): Promise<string | null> {
  const sessionId = getSessionIdFromCookie(c);
  const session = await getSession(sessionId);
  if (session?.moonshotApiKey) return session.moonshotApiKey;
  return process.env.MOONSHOT_API_KEY ?? process.env.KIMI_API_KEY ?? null;
}

function isMoonshotModel(model?: string | null): model is string {
  return Boolean(model && (model.startsWith("kimi") || model.startsWith("moonshot")));
}

export function resolveMoonshotModel(model?: string | null): string {
  // Only honor a requested model if it actually looks like a Moonshot/Kimi
  // model. This guards against stale clients sending a previously-configured
  // Ollama model name (e.g. "hermes-gemma4:e4b"), which Moonshot would reject.
  const requested =
    (isMoonshotModel(model) ? model : null) ??
    process.env.MOONSHOT_MODEL ??
    process.env.KIMI_MODEL ??
    DEFAULT_MOONSHOT_MODEL;
  return MOONSHOT_MODEL_ALIASES[requested] ?? requested;
}

export function resolveMoonshotModelForInput(
  userMessage: string,
  model?: string | null,
): string {
  const resolved = resolveMoonshotModel(model);
  if (!resolved.startsWith("kimi-k2.7")) return resolved;

  const configuredFast =
    process.env.MOONSHOT_FAST_MODEL ??
    process.env.KIMI_FAST_MODEL ??
    FAST_MOONSHOT_MODEL;
  const configuredReasoning =
    process.env.MOONSHOT_REASONING_MODEL ??
    process.env.KIMI_REASONING_MODEL ??
    DEFAULT_MOONSHOT_MODEL;

  if (REASONING_INTENT.test(userMessage)) {
    return resolveMoonshotModel(configuredReasoning);
  }

  if (FAST_INTENT.test(userMessage)) {
    return resolveMoonshotModel(configuredFast);
  }

  return resolved;
}

export function resolveMoonshotBaseUrl(): string {
  return (
    process.env.MOONSHOT_BASE_URL ??
    process.env.KIMI_BASE_URL ??
    "https://api.moonshot.ai/v1"
  ).replace(/\/$/, "");
}

export async function validateMoonshotApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${resolveMoonshotBaseUrl()}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getAuthStatus(c: Context) {
  const sessionId = getSessionIdFromCookie(c);
  const session = await getSession(sessionId);
  const ollamaOverride = Boolean(process.env.OLLAMA_MODEL);
  const moonshotOverride = Boolean(process.env.MOONSHOT_API_KEY ?? process.env.KIMI_API_KEY);
  const cursorOverride = Boolean(process.env.CURSOR_API_KEY);

  if (ollamaOverride) {
    const valid = await validateOllamaModel(resolveOllamaModel());

    return {
      connected: valid,
      provider: valid ? ("ollama" as const) : null,
      method: valid ? ("api_key" as const) : null,
      email: valid ? "Local Ollama" : null,
      model: resolveOllamaModel(),
      devOverride: valid,
    };
  }

  if (session?.moonshotApiKey) {
    return {
      connected: true,
      provider: session.provider,
      method: session.method,
      email: session.email,
      model: resolveMoonshotModel(session.model),
      devOverride: false,
    };
  }

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

  if (moonshotOverride) {
    const apiKey = await resolveMoonshotApiKey(c);
    const valid = apiKey ? await validateMoonshotApiKey(apiKey) : false;

    if (!valid) {
      return {
        connected: false,
        provider: null,
        method: null,
        email: null,
        model: resolveMoonshotModel(),
        devOverride: false,
      };
    }

    return {
      connected: true,
      provider: "moonshot" as const,
      method: "api_key" as const,
      email: "Moonshot environment key",
      model: resolveMoonshotModel(),
      devOverride: true,
    };
  }

  if (cursorOverride) {
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
    model: resolveMoonshotModel(),
    devOverride: false,
  };
}
