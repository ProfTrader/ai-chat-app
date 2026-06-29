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
import { agentFilesPromptBlock } from "../lib/agent-files.js";

const plan = new Hono();

const requestSchema = z.object({
  request: z.string().min(1),
  projectName: z.string().optional(),
  conversation: z.string().optional(),
  model: z.string().optional(),
});

// Lenient on maxima — the model often returns a few extra steps/assumptions or
// slightly long strings. We validate shape + minimums here, then clamp to the
// limits in sanitizePlan() rather than rejecting an otherwise-good plan.
const planSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(8),
  steps: z
    .array(
      z.object({
        action: z.string().min(3),
        tier: z.enum(["automatic", "strict", "approval"]).default("automatic"),
        detail: z.string().optional().default(""),
      }),
    )
    .min(1),
  assumptions: z.array(z.string().min(1)).default([]),
});

function sanitizePlan(raw: unknown) {
  const parsed = planSchema.parse(raw);
  return {
    title: parsed.title.slice(0, 120),
    summary: parsed.summary.slice(0, 400),
    steps: parsed.steps.slice(0, 8).map((step) => ({
      action: step.action.slice(0, 140),
      tier: step.tier,
      detail: (step.detail ?? "").slice(0, 240),
    })),
    assumptions: parsed.assumptions.map((item) => item.slice(0, 200)).slice(0, 6),
  };
}

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

plan.post("/", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid plan request." }, 400);
  }

  const model = await resolveModel(c, parsed.data.model);
  if (!model) {
    return c.json({ code: "MODEL_NOT_AVAILABLE", message: "Connect a model to draft a plan." }, 503);
  }

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const agentBrain = await agentFilesPromptBlock();

  const system =
    "You convert an agreed request and its intake conversation into a concrete, reviewable execution plan. You return strict JSON only. Steps are short and imperative (start with a verb), ordered, and non-overlapping. Each step has a tier: \"automatic\" (no side effects / safe to run), \"strict\" (needs care or review), or \"approval\" (a human must approve before it runs, e.g. sending, paying, granting access). Ground the plan in the firm context and the conversation; do not invent facts. Prefer 3-6 steps.";
  const user = `Draft an execution plan for "${parsed.data.projectName ?? "the current project"}".

Request:
${parsed.data.request}
${parsed.data.conversation ? `\nIntake conversation so far:\n${parsed.data.conversation}\n` : ""}
Firm context:
${firmBlock}
${agentBrain ? `\n${agentBrain}\n` : ""}
Return ONLY strict JSON:
{
  "title": "short plan title",
  "summary": "1-2 sentences on what the plan does and how it ends",
  "steps": [ { "action": "imperative step", "tier": "automatic|strict|approval", "detail": "one line of detail" } ],
  "assumptions": ["facts the plan rests on, from the conversation"]
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
            temperature: 0.3,
          });

    const result = sanitizePlan(parseModelJson(content));
    return c.json({ provider: model.provider, model: model.model, plan: result });
  } catch (error) {
    console.error("Plan draft error:", error);
    return c.json(
      { code: "PLAN_FAILED", message: error instanceof Error ? error.message : "Failed to draft plan." },
      500,
    );
  }
});

export { plan };
