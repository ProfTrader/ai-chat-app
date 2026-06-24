import { Hono } from "hono";
import { createUIMessageStreamResponse } from "ai";
import { resolveCursorApiKey } from "../lib/auth.js";
import { chatContextSchema, extractLatestUserMessage } from "../lib/context.js";
import { createCursorChatStream } from "../lib/cursor.js";

const chat = new Hono();

chat.post("/", async (c) => {
  const apiKey = await resolveCursorApiKey(c);
  if (!apiKey) {
    return c.json({ code: "AUTH_REQUIRED", message: "Connect Cursor to start chatting." }, 401);
  }

  const body = await c.req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userMessage = extractLatestUserMessage(messages);

  if (!userMessage) {
    return c.json({ code: "INVALID_REQUEST", message: "Missing user message." }, 400);
  }

  const context = chatContextSchema.parse({
    sessionId: body.sessionId,
    projectId: body.projectId,
    projectName: body.projectName,
    projectSlug: body.projectSlug,
    workspaceName: body.workspaceName,
    composerMode: body.composerMode ?? "auto",
    contextChips: body.contextChips ?? [],
    tasksSummary: body.tasksSummary,
  });

  const model =
    body.model ??
    process.env.CURSOR_MODEL ??
    "composer-2.5";

  try {
    const stream = createCursorChatStream({
      apiKey,
      model,
      userMessage,
      context,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat stream error:", error);
    return c.json(
      {
        code: "CHAT_ERROR",
        message: error instanceof Error ? error.message : "Failed to generate response.",
      },
      500,
    );
  }
});

export { chat };
