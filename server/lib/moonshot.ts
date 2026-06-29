import type { ChatContext } from "./context.js";
import { buildSystemPrompt, summarizeContextForActivity } from "./context.js";

interface MoonshotChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
    message?: {
      content?: string | Array<{ text?: string; content?: string; type?: string }>;
      reasoning_content?: string;
    };
    text?: string;
    finish_reason?: string;
  }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; content?: string; type?: string }>;
  }>;
  error?: {
    message?: string;
  };
}

function isKimiThinkingModel(model: string) {
  return model.startsWith("kimi-k2.7") || model.startsWith("kimi-k2.6");
}

function buildMoonshotRequestBody({
  model,
  stream,
  messages,
  temperature,
  maxTokens,
}: {
  model: string;
  stream: boolean;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}) {
  const thinkingModel = isKimiThinkingModel(model);
  return {
    model,
    stream,
    ...(thinkingModel
      ? { max_tokens: maxTokens ?? 32768 }
      : {
          temperature: temperature ?? 0.2,
          max_completion_tokens: maxTokens ?? 2200,
        }),
    messages,
  };
}

function extractTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as { text?: unknown; content?: unknown };
      if (typeof item.text === "string") return item.text;
      if (typeof item.content === "string") return item.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractMoonshotCompletionContent(data: MoonshotChunk): string {
  const choice = data.choices?.[0];
  const outputContent = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => extractTextContent([part]))
    .filter(Boolean)
    .join("\n");

  return (
    extractTextContent(choice?.message?.content) ||
    extractTextContent(choice?.delta?.content) ||
    extractTextContent(choice?.text) ||
    extractTextContent(data.output_text) ||
    outputContent ||
    extractTextContent(choice?.message?.reasoning_content)
  );
}

function findBalancedJsonObject(content: string) {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return content.slice(start, index + 1);
  }
  return null;
}

function parseMoonshotJsonObject(text: string) {
  try {
    return JSON.parse(text) as MoonshotChunk;
  } catch {
    const json = findBalancedJsonObject(text);
    if (!json) throw new Error(text || "Moonshot returned an invalid JSON response.");
    return JSON.parse(json) as MoonshotChunk;
  }
}

function parseMoonshotCompletionBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Moonshot returned an empty response.");

  if (trimmed.includes("\ndata:") || trimmed.startsWith("data:")) {
    let content = "";
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      const parsed = parseMoonshotJsonObject(payload);
      if (parsed.error?.message) throw new Error(parsed.error.message);
      content += extractMoonshotCompletionContent(parsed);
    }
    if (content.trim()) return content.trim();
  }

  const jsonLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  if (jsonLines.length > 1) {
    let content = "";
    for (const line of jsonLines) {
      const parsed = parseMoonshotJsonObject(line);
      if (parsed.error?.message) throw new Error(parsed.error.message);
      content += extractMoonshotCompletionContent(parsed);
    }
    if (content.trim()) return content.trim();
  }

  const data = parseMoonshotJsonObject(trimmed);
  if (data.error?.message) throw new Error(data.error.message);
  const content = extractMoonshotCompletionContent(data);
  if (!content) throw new Error("Moonshot did not return a message.");
  return content;
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
  const requestBody = buildMoonshotRequestBody({
    model: options.model,
    stream: true,
    maxTokens: isKimiThinkingModel(options.model) ? 32768 : 1200,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: options.userMessage },
    ],
  });

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
        summarizeContextForActivity(options.context),
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
        body: JSON.stringify(requestBody),
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

export async function createMoonshotChatCompletion(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const requestBody = buildMoonshotRequestBody({
    model: options.model,
    stream: false,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  });

  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Moonshot request failed with status ${response.status}`);
  }

  return parseMoonshotCompletionBody(await response.text());
}
