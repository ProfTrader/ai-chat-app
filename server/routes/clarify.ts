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

const clarify = new Hono();

const requestSchema = z.object({
  instruction: z.string().min(1),
  projectName: z.string().optional(),
  model: z.string().optional(),
});

const planSchema = z.object({
  intro: z.string().min(8).max(240),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(4).max(160),
        options: z.array(z.string().min(1).max(80)).min(2).max(5),
        multi: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(4),
  cta: z.string().min(2).max(40).default("Continue"),
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

clarify.post("/", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid clarify request." }, 400);
  }

  const model = await resolveModel(c, parsed.data.model);
  if (!model) {
    return c.json({ code: "MODEL_NOT_AVAILABLE", message: "Connect a model to continue." }, 503);
  }

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const system =
    "You run a friendly, interactive intake. Before producing a deliverable you ask a few sharp multiple-choice questions to remove ambiguity. You return strict JSON only. Questions must be specific to the request and the firm; options must be concrete, mutually exclusive choices a busy operator can tap quickly. Use multi:true only when several options can apply at once (e.g. channels).";
  const user = `The user asked: "${parsed.data.instruction}"
Project: ${parsed.data.projectName ?? "the current project"}

Firm context:
${firmBlock}

Generate 2-4 multiple-choice questions that you need answered before you can produce a great result. Tailor questions and options to this firm and request. Return ONLY strict JSON:
{
  "intro": "one short friendly sentence on why you're asking",
  "questions": [
    { "id": "short_key", "prompt": "the question", "options": ["concrete option", "concrete option", "concrete option"], "multi": false }
  ],
  "cta": "short button label like 'Build it' or 'Draft it'"
}`;

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
            temperature: 0.4,
          });

    const plan = planSchema.parse(parseModelJson(content));
    return c.json({ provider: model.provider, model: model.model, plan });
  } catch (error) {
    console.error("Clarify error:", error);
    return c.json(
      { code: "CLARIFY_FAILED", message: error instanceof Error ? error.message : "Failed to build questions." },
      500,
    );
  }
});

export { clarify };
