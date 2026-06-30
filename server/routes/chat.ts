import { Hono } from "hono";
import {
  resolveCursorApiKey,
  resolveMoonshotBaseUrl,
  resolveMoonshotApiKey,
  resolveMoonshotModel,
  resolveMoonshotModelForInput,
  validateMoonshotApiKey,
} from "../lib/auth.js";
import { chatContextSchema, extractLatestUserMessage } from "../lib/context.js";
import { firmProfileToPromptBlock, loadFirmProfile } from "../lib/firm-profile.js";
import { agentFilesPromptBlock } from "../lib/agent-files.js";
import { createCursorChatStream } from "../lib/cursor.js";
import { createMoonshotChatStream } from "../lib/moonshot.js";
import {
  createOllamaChatStream,
  resolveOllamaBaseUrl,
  resolveOllamaModel,
  validateOllamaModel,
} from "../lib/ollama.js";

const chat = new Hono();

chat.post("/", async (c) => {
  const useOllama = Boolean(process.env.OLLAMA_MODEL);
  const moonshotApiKey = await resolveMoonshotApiKey(c);
  const cursorApiKey = await resolveCursorApiKey(c);

  if (useOllama && !(await validateOllamaModel(resolveOllamaModel()))) {
    return c.json(
      {
        code: "OLLAMA_MODEL_NOT_FOUND",
        message: `Ollama model ${resolveOllamaModel()} is not available locally.`,
      },
      401,
    );
  }

  if (!useOllama && !moonshotApiKey && !cursorApiKey) {
    return c.json(
      {
        code: "AUTH_REQUIRED",
        message:
          "Set MOONSHOT_API_KEY or KIMI_API_KEY on the server to start chatting.",
      },
      401,
    );
  }

  if (!useOllama && moonshotApiKey && !(await validateMoonshotApiKey(moonshotApiKey))) {
    return c.json(
      {
        code: "INVALID_API_KEY",
        message: "Moonshot/Kimi rejected the configured API key.",
      },
      401,
    );
  }

  const body = await c.req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userMessage = extractLatestUserMessage(messages);

  if (!userMessage) {
    return c.json({ code: "INVALID_REQUEST", message: "Missing user message." }, 400);
  }

  // Load the saved firm profile server-side so the agent always carries the
  // firm's "soul", independent of what the client sends.
  const firmRecord = await loadFirmProfile();
  // Load the agent's durable soul + memory files so they shape every turn.
  const agentBrainFiles = await agentFilesPromptBlock();

  const context = chatContextSchema.parse({
    sessionId: body.sessionId,
    projectId: body.projectId,
    projectName: body.projectName,
    projectSlug: body.projectSlug,
    workspaceName: body.workspaceName,
    composerMode: body.composerMode ?? "auto",
    contextChips: body.contextChips ?? [],
    tasksSummary: body.tasksSummary,
    contactsSummary: body.contactsSummary,
    teamSummary: body.teamSummary,
    datasetsSummary: body.datasetsSummary,
    memoriesSummary: body.memoriesSummary,
    researchSummary: body.researchSummary,
    recentMessages: body.recentMessages,
    businessProfile: body.businessProfile,
    firmMemory: firmRecord ? firmProfileToPromptBlock(firmRecord) : undefined,
    firmName: firmRecord?.answers.businessName,
    agentBrainFiles,
  });

  const model = useOllama
    ? resolveOllamaModel(body.model)
    : moonshotApiKey
    ? resolveMoonshotModelForInput(userMessage, body.model)
    : body.model ?? process.env.CURSOR_MODEL ?? "composer-2.5";

  try {
    const stream = useOllama
      ? createOllamaChatStream({
          baseUrl: resolveOllamaBaseUrl(),
          model,
          userMessage,
          context,
        })
      : moonshotApiKey
        ? createMoonshotChatStream({
          apiKey: moonshotApiKey,
          baseUrl: resolveMoonshotBaseUrl(),
          model,
          userMessage,
          context,
        })
        : createCursorChatStream({
          apiKey: cursorApiKey!,
          model,
          userMessage,
          context,
        });

    const { createUIMessageStreamResponse } = await import("ai");
    return createUIMessageStreamResponse({ stream: await stream });
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
