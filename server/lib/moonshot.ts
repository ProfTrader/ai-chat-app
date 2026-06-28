import type { ChatContext } from "./context.js";
import { buildSystemPrompt, summarizeContextForActivity } from "./context.js";

interface MoonshotChunk {
  choices?: Array<{
    delta?: {
      content?: string;
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
  ).trim();
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
  // The kimi-k2 series (k2.5 / k2.6 / k2.7*) only accepts temperature 1.
  const isReasoningModel = options.model.startsWith("kimi-k2");
  const temperature = isReasoningModel ? 1 : 0.2;
  // kimi-k2 reasons before answering, and reasoning tokens count against this
  // budget. A small cap (e.g. 1200) gets fully consumed by reasoning, leaving
  // the answer truncated or empty. Give reasoning models plenty of headroom.
  const maxCompletionTokens = isReasoningModel ? 8192 : 1200;

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
        body: JSON.stringify({
          model: options.model,
          stream: true,
          temperature,
          max_completion_tokens: maxCompletionTokens,
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

export async function createMoonshotChatCompletion(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      temperature: options.temperature ?? (options.model.startsWith("kimi-k2") ? 1 : 0.2),
      max_completion_tokens:
        options.maxTokens ?? (options.model.startsWith("kimi-k2") ? 8192 : 2200),
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Moonshot request failed with status ${response.status}`);
  }

  const data = (await response.json()) as MoonshotChunk;
  const content = extractMoonshotCompletionContent(data);
  if (data.error?.message) throw new Error(data.error.message);
  if (!content) throw new Error("Moonshot did not return a message.");
  return content;
}
