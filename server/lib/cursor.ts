import type { ChatContext } from "./context.js";
import { buildSystemPrompt } from "./context.js";

export async function validateCursorApiKey(apiKey: string) {
  const { Cursor } = await import("@cursor/sdk");
  const user = await Cursor.me({ apiKey });
  return user;
}

export async function listCursorModels(apiKey: string) {
  const { Cursor } = await import("@cursor/sdk");
  return Cursor.models.list({ apiKey });
}

export async function createCursorChatStream(options: {
  apiKey: string;
  model: string;
  userMessage: string;
  context: ChatContext;
}) {
  const [{ Agent }, { createUIMessageStream, generateId }] = await Promise.all([
    import("@cursor/sdk"),
    import("ai"),
  ]);
  const systemPrompt = buildSystemPrompt(options.context);
  const prompt = `${systemPrompt}\n\nUser message:\n${options.userMessage}`;

  return createUIMessageStream({
    execute: async ({ writer }) => {
      const messageId = generateId();
      const activityId = generateId();
      let agent: Awaited<ReturnType<typeof Agent.create>> | null = null;

      try {
        const writeActivity = (
          status: "running" | "complete",
          label: string,
          detail: string,
          toolName: string,
        ) => {
          writer.write({
            type: "data-activity",
            id: `${activityId}-${toolName}-${status}`,
            data: {
              status,
              label,
              detail,
              toolName,
              provider: "cursor",
              model: options.model,
              at: new Date().toISOString(),
            },
          });
        };

        writer.write({ type: "start" });
        writeActivity(
          "complete",
          "Project context inspected",
          `${options.context.tasksSummary?.length ?? 0} task references and ${options.context.contextChips.length} context chips prepared.`,
          "inspect_project_context",
        );
        writeActivity(
          "running",
          "Starting Cursor agent",
          `Creating a local agent session with ${options.model}.`,
          "start_cursor_agent",
        );

        agent = await Agent.create({
          apiKey: options.apiKey,
          model: { id: options.model },
          local: { cwd: process.cwd() },
        });

        const run = await agent.send(prompt);
        writeActivity(
          "complete",
          "Cursor agent connected",
          "The agent session is streaming assistant events.",
          "start_cursor_agent",
        );
        writer.write({ type: "text-start", id: messageId });

        let lastText = "";
        for await (const event of run.stream()) {
          if (event.type !== "assistant") continue;
          for (const block of event.message.content) {
            if (block.type !== "text") continue;
            const delta = block.text.slice(lastText.length);
            if (delta) {
              writer.write({ type: "text-delta", id: messageId, delta });
              lastText = block.text;
            }
          }
        }

        if (!lastText) {
          const result = await run.wait();
          const fallback = result.result ?? "I couldn't generate a response.";
          writer.write({ type: "text-delta", id: messageId, delta: fallback });
        }

        writer.write({ type: "text-end", id: messageId });
        writer.write({ type: "finish" });
      } finally {
        await agent?.close?.();
      }
    },
    onError: () => "An error occurred while generating a response.",
  });
}
