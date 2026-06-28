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

const email = new Hono();

const draftSchema = z.object({
  instruction: z.string().min(1),
  model: z.string().optional(),
});

const emailSchema = z.object({
  to: z.string().default(""),
  subject: z.string().min(1),
  body: z.string().min(1),
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

email.post("/draft", async (c) => {
  const parsed = draftSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid email request." }, 400);
  }

  const model = await resolveModel(c, parsed.data.model);
  if (!model) {
    return c.json(
      { code: "MODEL_NOT_AVAILABLE", message: "Connect a model to draft emails." },
      503,
    );
  }

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const system =
    "You write clear, professional, ready-to-send business emails. You return strict JSON only. Write in the voice of the firm described, keep it concise and warm, and use \\n for line breaks between paragraphs. Do not invent recipient names; leave 'to' empty if unknown.";
  const user = `Draft an email based on this instruction:
${parsed.data.instruction}

Firm context (write as this firm):
${firmBlock}

Return ONLY strict JSON: { "to": "recipient email or empty", "subject": "subject line", "body": "full email body with \\n line breaks, including a greeting and sign-off" }`;

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

    const draft = emailSchema.parse(parseModelJson(content));
    return c.json({ provider: model.provider, model: model.model, email: draft });
  } catch (error) {
    console.error("Email draft error:", error);
    return c.json(
      { code: "DRAFT_FAILED", message: error instanceof Error ? error.message : "Failed to draft email." },
      500,
    );
  }
});

export { email };
