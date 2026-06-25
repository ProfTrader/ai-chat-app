export interface AuthStatus {
  connected: boolean;
  provider: "cursor" | "openai" | "moonshot" | "ollama" | null;
  method: "api_key" | "browser" | null;
  email: string | null;
  model: string;
  devOverride?: boolean;
}

export interface CursorModel {
  id: string;
  name: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Request failed"), { code: data.code });
  }
  return data as T;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status", { credentials: "include" });
  return parseJson<AuthStatus>(response);
}

export async function startCursorAuth(): Promise<{
  authUrl: string;
  instructions: string;
  fallbackUrl: string;
}> {
  const response = await fetch("/api/auth/cursor/start", {
    method: "POST",
    credentials: "include",
  });
  return parseJson(response);
}

export async function connectCursorApiKey(apiKey: string, model?: string) {
  const response = await fetch("/api/auth/moonshot/api-key", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, model }),
  });
  return parseJson<AuthStatus>(response);
}

export async function fetchCursorModels(): Promise<CursorModel[]> {
  const response = await fetch("/api/auth/moonshot/models", { credentials: "include" });
  const data = await parseJson<{ models: CursorModel[] }>(response);
  return data.models;
}

export async function updateCursorModel(model: string) {
  const response = await fetch("/api/auth/moonshot/model", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  return parseJson<{ model: string }>(response);
}

export async function logoutAuth() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<{ connected: boolean }>(response);
}
