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
import { loadFirmProfile, loadFirmProfileHtml, saveFirmProfile } from "../lib/firm-profile.js";
import { syncSoulOfFirmFromProfile } from "../lib/agent-files.js";

const onboarding = new Hono();

const socialsSchema = z
  .object({
    website: z.string().optional(),
    linkedin: z.string().optional(),
    twitter: z.string().optional(),
    instagram: z.string().optional(),
    other: z.string().optional(),
  })
  .default({});

const researchRequestSchema = z.object({
  businessName: z.string().min(1),
  description: z.string().optional().default(""),
  domain: z.string().optional().default(""),
  goals: z.string().optional().default(""),
  socials: socialsSchema,
  model: z.string().optional(),
});

const profileSchema = z.object({
  summary: z.string().min(40),
  industry: z.string().min(2),
  businessModel: z.string().min(2),
  targetCustomers: z.array(z.string().min(2)).min(1).max(6),
  valueProposition: z.string().min(20),
  competitors: z.array(z.string().min(1)).max(6).default([]),
  opportunities: z.array(z.string().min(6)).min(1).max(6),
  suggestedProjects: z
    .array(
      z.object({
        name: z.string().min(2),
        description: z.string().min(8),
      }),
    )
    .min(1)
    .max(5),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().min(4),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
      }),
    )
    .min(1)
    .max(8),
  crmSetupTips: z.array(z.string().min(8)).min(1).max(6),
});

export type BusinessProfile = z.infer<typeof profileSchema>;

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

function parseModelJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const json = findBalancedJsonObject(candidate) ?? findBalancedJsonObject(content);
  if (!json) throw new Error("The model did not return JSON.");
  return JSON.parse(json) as unknown;
}

type Provider = "moonshot" | "ollama";

interface ResearchModel {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

async function resolveResearchModel(
  c: Context,
  requestedModel?: string | null,
): Promise<ResearchModel | null> {
  const moonshotApiKey = await resolveMoonshotApiKey(c);
  if (moonshotApiKey && (await validateMoonshotApiKey(moonshotApiKey))) {
    return {
      provider: "moonshot",
      model: resolveMoonshotModel(requestedModel),
      apiKey: moonshotApiKey,
      baseUrl: resolveMoonshotBaseUrl(),
    };
  }
  const ollamaModel = resolveOllamaModel(requestedModel);
  if (await validateOllamaModel(ollamaModel)) {
    return { provider: "ollama", model: ollamaModel };
  }
  return null;
}

function buildResearchPrompt(input: z.infer<typeof researchRequestSchema>) {
  const socials = Object.entries(input.socials)
    .filter(([, value]) => value && value.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `Research and profile this business so we can tailor their CRM workspace.

Business name: ${input.businessName}
What they do: ${input.description || "(not provided)"}
Industry / domain: ${input.domain || "(not provided)"}
Stated goals: ${input.goals || "(not provided)"}
Public profiles / socials:
${socials || "- (none provided)"}

Use the provided details plus what you reasonably know about this kind of business and any well-known brand by this name. Be concrete and practical. Do not fabricate specific metrics, revenue numbers, or named private individuals. If you are unsure about a competitor or fact, keep it general.

Return ONLY strict JSON with this exact shape:
{
  "summary": "2-3 sentence plain-language description of the business",
  "industry": "primary industry / category",
  "businessModel": "how they make money (e.g. B2B SaaS, DTC ecommerce, agency, marketplace)",
  "targetCustomers": ["2-5 specific customer segments / ICPs"],
  "valueProposition": "one sentence core value proposition",
  "competitors": ["up to 5 likely competitors or comparable companies"],
  "opportunities": ["3-5 growth opportunities or risks to watch"],
  "suggestedProjects": [
    { "name": "short project name", "description": "one line on why it matters for this business" }
  ],
  "suggestedTasks": [
    { "title": "concrete first task", "priority": "high" }
  ],
  "crmSetupTips": ["3-5 tips for how this business should use a CRM workspace"]
}`;
}

async function generateProfile(model: ResearchModel, user: string, repair?: string) {
  const system =
    "You are a sharp business analyst onboarding a new company into the Nexus CRM workspace. You produce concise, practical, structured business profiles. Return strict JSON only, no prose, no markdown fences.";
  const finalUser = repair
    ? `${user}\n\nThe previous response failed validation:\n${repair}\n\nReturn corrected strict JSON only.`
    : user;

  const content =
    model.provider === "moonshot"
      ? await createMoonshotChatCompletion({
          apiKey: model.apiKey ?? "",
          baseUrl: model.baseUrl ?? resolveMoonshotBaseUrl(),
          model: model.model,
          system,
          user: finalUser,
        })
      : await createOllamaChatCompletion({
          baseUrl: resolveOllamaBaseUrl(),
          model: model.model,
          system,
          user: finalUser,
          temperature: 0.2,
        });

  try {
    return profileSchema.parse(parseModelJson(content));
  } catch (error) {
    if (repair) throw error;
    const reason = error instanceof Error ? error.message : "schema mismatch";
    return generateProfile(model, `${user}\n\nInvalid response to repair:\n${content.slice(0, 4000)}`, reason);
  }
}

onboarding.post("/research", async (c) => {
  const parsed = researchRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid research request." }, 400);
  }

  const researchModel = await resolveResearchModel(c, parsed.data.model);
  if (!researchModel) {
    return c.json(
      {
        code: "MODEL_NOT_AVAILABLE",
        message: "Connect a Moonshot/Kimi key or local Ollama model to run onboarding research.",
      },
      503,
    );
  }

  try {
    const profile = await generateProfile(researchModel, buildResearchPrompt(parsed.data));
    return c.json({ provider: researchModel.provider, model: researchModel.model, profile });
  } catch (error) {
    console.error("Onboarding research error:", error);
    return c.json(
      {
        code: "RESEARCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to research the business.",
      },
      500,
    );
  }
});

const saveProfileSchema = z.object({
  answers: z.object({
    businessName: z.string().min(1),
    description: z.string().optional(),
    domain: z.string().optional(),
    goals: z.string().optional(),
    socials: socialsSchema,
  }),
  profile: profileSchema,
  provider: z.string().optional(),
  model: z.string().optional(),
});

// Persist the firm profile as the durable "soul of the firm" (JSON + HTML files).
onboarding.put("/profile", async (c) => {
  const parsed = saveProfileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid firm profile." }, 400);
  }
  try {
    const record = await saveFirmProfile(parsed.data);
    // Refresh the editable "soul of the firm" agent file from the new profile.
    await syncSoulOfFirmFromProfile();
    return c.json({ saved: true, savedAt: record.savedAt });
  } catch (error) {
    console.error("Save firm profile error:", error);
    return c.json(
      { code: "SAVE_FAILED", message: error instanceof Error ? error.message : "Failed to save profile." },
      500,
    );
  }
});

onboarding.get("/profile", async (c) => {
  const record = await loadFirmProfile();
  if (!record) return c.json({ code: "NOT_FOUND", message: "No firm profile saved yet." }, 404);
  return c.json(record);
});

onboarding.get("/profile.html", async (c) => {
  const html = await loadFirmProfileHtml();
  if (!html) return c.text("No firm profile saved yet.", 404);
  return c.html(html);
});

export { onboarding };
