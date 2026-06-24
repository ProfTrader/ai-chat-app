import { spawn } from "node:child_process";
import { Hono } from "hono";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getAuthStatus,
  getSessionIdFromCookie,
  resolveCursorApiKey,
  setSessionCookie,
  updateSession,
} from "../lib/auth.js";
import { listCursorModels, validateCursorApiKey } from "../lib/cursor.js";

const auth = new Hono();

auth.get("/status", async (c) => {
  return c.json(await getAuthStatus(c));
});

auth.post("/cursor/start", async (c) => {
  const dashboardUrl = "https://cursor.com/dashboard?tab=settings";

  const tryCliLogin = (): Promise<string | null> =>
    new Promise((resolve) => {
      const child = spawn("cursor", ["agent", "login"], {
        env: { ...process.env, NO_OPEN_BROWSER: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on("error", () => resolve(null));
      child.on("close", () => {
        const match = output.match(/https?:\/\/[^\s]+/);
        resolve(match?.[0] ?? null);
      });

      setTimeout(() => {
        child.kill();
        resolve(null);
      }, 3000);
    });

  const cliUrl = await tryCliLogin();

  return c.json({
    authUrl: cliUrl ?? dashboardUrl,
    instructions:
      "Sign in with your Cursor account in the browser, then create an API key and paste it below if prompted.",
    fallbackUrl: dashboardUrl,
  });
});

auth.post("/cursor/api-key", async (c) => {
  const body = z
    .object({
      apiKey: z.string().min(10),
      model: z.string().optional(),
    })
    .parse(await c.req.json());

  try {
    const user = await validateCursorApiKey(body.apiKey);
    const session = await createSession({
      provider: "cursor",
      method: "api_key",
      cursorApiKey: body.apiKey,
      email: user.userEmail ?? user.apiKeyName,
      model: body.model ?? process.env.CURSOR_MODEL ?? "composer-2.5",
    });

    setSessionCookie(c, session.id);
    return c.json({
      connected: true,
      provider: "cursor",
      method: "api_key",
      email: user.userEmail ?? user.apiKeyName,
      model: session.model,
    });
  } catch (error) {
    return c.json(
      {
        code: "INVALID_API_KEY",
        message: error instanceof Error ? error.message : "Invalid Cursor API key",
      },
      401,
    );
  }
});

auth.get("/cursor/models", async (c) => {
  const status = await getAuthStatus(c);
  if (!status.connected) {
    return c.json({ code: "AUTH_REQUIRED", message: "Connect Cursor first." }, 401);
  }

  const apiKey = await resolveCursorApiKey(c);
  if (!apiKey) {
    return c.json({ code: "AUTH_REQUIRED", message: "Connect Cursor first." }, 401);
  }

  try {
    const models = await listCursorModels(apiKey);
    return c.json({
      models: models.map((m) => ({ id: m.id, name: m.displayName ?? m.id })),
    });
  } catch {
    return c.json({
      models: [{ id: status.model ?? "composer-2.5", name: status.model ?? "composer-2.5" }],
    });
  }
});

auth.patch("/cursor/model", async (c) => {
  const sessionId = getSessionIdFromCookie(c);
  if (!sessionId) {
    return c.json({ code: "AUTH_REQUIRED" }, 401);
  }

  const body = z.object({ model: z.string().min(1) }).parse(await c.req.json());
  const session = await updateSession(sessionId, { model: body.model });
  if (!session) {
    return c.json({ code: "AUTH_REQUIRED" }, 401);
  }

  return c.json({ model: session.model });
});

auth.post("/logout", async (c) => {
  const sessionId = getSessionIdFromCookie(c);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  clearSessionCookie(c);
  return c.json({ connected: false });
});

export { auth };
