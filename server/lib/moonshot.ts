import type { ChatContext } from "./context.js";
import { buildSystemPrompt } from "./context.js";

interface MoonshotChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function listMoonshotModels(apiKey: string, baseUrl: string) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Moonshot model request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ id: string; display_name?: string; owned_by?: string }>;
  };

  return data.data ?? [];
}

export async function createMoonshotChatStream(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  userMessage: string;
  context: ChatContext;
}) {
  const { createUIMessageStream, generateId } = await import("ai");
  const systemPrompt = buildSystemPrompt(options.context);

  return createUIMessageStream({
    execute: async ({ writer }) => {
      const messageId = generateId();
      const activityId = generateId();

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
            provider: "moonshot",
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
        "Calling Moonshot",
        `Streaming from ${options.model}.`,
        "stream_remote_model",
      );

      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          temperature: 0.2,
          max_completion_tokens: 1200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: options.userMessage },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Moonshot request failed with status ${response.status}`);
      }

      writer.write({ type: "text-start", id: messageId });

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;

          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          const parsed = JSON.parse(data) as MoonshotChunk;
          if (parsed.error?.message) throw new Error(parsed.error.message);

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            writer.write({ type: "text-delta", id: messageId, delta });
          }
        }
      }

      writer.write({ type: "text-end", id: messageId });
      writeActivity(
        "complete",
        "Moonshot response streamed",
        "The assistant response finished without blocking the workspace.",
        "stream_remote_model",
      );
      writer.write({ type: "finish" });
    },
    onError: (error) => {
      console.error("Moonshot stream error:", error);
      return "An error occurred while generating a Moonshot response.";
    },
  });
}
