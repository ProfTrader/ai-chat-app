import type { ChatContext } from "./context.js";
import { buildSystemPrompt } from "./context.js";

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

interface OllamaChatChunk {
  message?: {
    content?: string;
  };
  response?: string;
  error?: string;
  done?: boolean;
}

export function resolveOllamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

export function resolveOllamaModel(model?: string | null): string {
  return model ?? process.env.OLLAMA_MODEL ?? "hermes-gemma4:e4b";
}

export async function listOllamaModels(baseUrl = resolveOllamaBaseUrl()) {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Ollama tags request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  return data.models ?? [];
}

export async function validateOllamaModel(model = resolveOllamaModel()) {
  try {
    const models = await listOllamaModels();
    return models.some((item) => item.name === model || item.model === model);
  } catch {
    return false;
  }
}

export async function createOllamaChatStream(options: {
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

      const response = await fetch(`${options.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: options.userMessage },
          ],
          options: {
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok || !response.body) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Ollama request failed with status ${response.status}`);
      }

      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: messageId });

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          const parsed = JSON.parse(line) as OllamaChatChunk;
          if (parsed.error) throw new Error(parsed.error);

          const delta = parsed.message?.content ?? parsed.response;
          if (delta) {
            writer.write({ type: "text-delta", id: messageId, delta });
          }
        }
      }

      writer.write({ type: "text-end", id: messageId });
      writer.write({ type: "finish" });
    },
    onError: (error) => {
      console.error("Ollama stream error:", error);
      return "An error occurred while generating an Ollama response.";
    },
  });
}
