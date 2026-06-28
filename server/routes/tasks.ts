import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  resolveMoonshotApiKey,
  resolveMoonshotBaseUrl,
  resolveMoonshotModel,
  validateMoonshotApiKey,
} from "../lib/auth.js";
import { createMoonshotChatCompletion } from "../lib/moonshot.js";
import {
  createOllamaChatCompletion,
  resolveOllamaBaseUrl,
  resolveOllamaModel,
  validateOllamaModel,
} from "../lib/ollama.js";
import { firmProfileToPromptBlock, loadFirmProfile } from "../lib/firm-profile.js";

const tasks = new Hono();

const proposeSchema = z.object({
  instruction: z.string().min(1),
  projectName: z.string().optional(),
  team: z.array(z.string()).optional().default([]),
  existingTasks: z.array(z.string()).optional().default([]),
  model: z.string().optional(),
});

const proposedTaskSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().optional().default(""),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
});

const responseSchema = z.object({
  tasks: z.array(proposedTaskSchema).min(1).max(10),
});

function findBalancedJsonObject(content: string) {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return content.slice(start, index + 1);
  }
  return null;
}

function parseModelJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const json = findBalancedJsonObject(candidate) ?? findBalancedJsonObject(content);
  if (!json) throw new Error("The model did not return JSON.");
  return JSON.parse(json) as unknown;
}

type Provider = "moonshot" | "ollama";
interface DraftModel {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

async function resolveModel(c: Context, requested?: string | null): Promise<DraftModel | null> {
  const moonshotApiKey = await resolveMoonshotApiKey(c);
  if (moonshotApiKey && (await validateMoonshotApiKey(moonshotApiKey))) {
    return {
      provider: "moonshot",
      model: resolveMoonshotModel(requested),
      apiKey: moonshotApiKey,
      baseUrl: resolveMoonshotBaseUrl(),
    };
  }
  const ollamaModel = resolveOllamaModel(requested);
  if (await validateOllamaModel(ollamaModel)) return { provider: "ollama", model: ollamaModel };
  return null;
}

tasks.post("/propose", async (c) => {
  const parsed = proposeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid task request." }, 400);
  }

  const model = await resolveModel(c, parsed.data.model);
  if (!model) {
    return c.json({ code: "MODEL_NOT_AVAILABLE", message: "Connect a model to propose tasks." }, 503);
  }

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const team = parsed.data.team.length ? parsed.data.team.join(", ") : "(no team members listed)";
  const existing = parsed.data.existingTasks.length
    ? parsed.data.existingTasks.map((t) => `- ${t}`).join("\n")
    : "(none)";

  const system =
    "You break work down into concrete, actionable project tasks. You return strict JSON only. Titles are short and imperative (start with a verb). Do not duplicate existing tasks. Only set dueDate when clearly implied, as an ISO date (YYYY-MM-DD).";
  const user = `Break this request into actionable tasks for the project "${parsed.data.projectName ?? "the project"}".

Request:
${parsed.data.instruction}

Firm context:
${firmBlock}

Team members you may assign as owners (use a name only if it fits):
${team}

Existing tasks (do not duplicate):
${existing}

Return ONLY strict JSON:
{ "tasks": [ { "title": "imperative title", "description": "one line of detail", "priority": "high|medium|low", "status": "todo", "assignee": "team member name or omit", "dueDate": "YYYY-MM-DD or omit" } ] }`;

  try {
    const content =
      model.provider === "moonshot"
        ? await createMoonshotChatCompletion({
            apiKey: model.apiKey ?? "",
            baseUrl: model.baseUrl ?? resolveMoonshotBaseUrl(),
            model: model.model,
            system,
            user,
          })
        : await createOllamaChatCompletion({
            baseUrl: resolveOllamaBaseUrl(),
            model: model.model,
            system,
            user,
            temperature: 0.3,
          });

    const result = responseSchema.parse(parseModelJson(content));
    return c.json({ provider: model.provider, model: model.model, tasks: result.tasks });
  } catch (error) {
    console.error("Task proposal error:", error);
    return c.json(
      { code: "PROPOSE_FAILED", message: error instanceof Error ? error.message : "Failed to propose tasks." },
      500,
    );
  }
});

export { tasks };
