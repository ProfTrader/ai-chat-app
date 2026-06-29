import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
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

const memorySchema = z.object({
  kind: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  confidence: z.number().optional(),
});

const intakeRequestSchema = requestSchema.extend({
  memories: z.array(memorySchema).default([]),
  previousQuestions: z.array(z.string()).default([]),
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

const intakeSchema = z.object({
  question: z.string().optional().default(""),
  chips: z.array(z.string()).default([]),
  ready: z.boolean().default(false),
  rationale: z.string().optional().default(""),
  memorySignals: z.array(z.string()).default([]),
});

const corpusSchema = z.array(
  z.object({
    id: z.string(),
    domain: z.string(),
    intents: z.array(z.string()),
    questionPatterns: z.array(z.string()),
    chipExamples: z.array(z.string()),
    appliesWhen: z.array(z.string()),
  }),
);

type CorpusRecord = z.infer<typeof corpusSchema>[number];

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

function sanitizeIntake(raw: unknown) {
  const parsed = intakeSchema.parse(raw);
  const chips = parsed.chips
    .map((chip) => chip.trim())
    .filter(Boolean)
    .filter((chip, index, all) => all.findIndex((item) => item.toLowerCase() === chip.toLowerCase()) === index)
    .slice(0, 4)
    .map((chip) => chip.slice(0, 120));
  const readyText =
    parsed.question.trim() ||
    "I have enough context to draft the editable plan now.";
  return {
    question: readyText.slice(0, 280),
    chips: parsed.ready ? [] : chips,
    ready: parsed.ready,
    rationale: parsed.rationale.slice(0, 240),
    memorySignals: parsed.memorySignals.map((item) => item.slice(0, 160)).slice(0, 4),
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

let corpusCache: CorpusRecord[] | null = null;

async function loadPlanCorpus() {
  if (corpusCache) return corpusCache;
  const file = path.join(process.cwd(), "server", "data", "plan-question-corpus.json");
  const raw = await readFile(file, "utf8");
  corpusCache = corpusSchema.parse(JSON.parse(raw));
  return corpusCache;
}

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function scoreRecord(record: CorpusRecord, queryTokens: Set<string>) {
  const haystack = [
    record.domain,
    ...record.intents,
    ...record.questionPatterns,
    ...record.chipExamples,
    ...record.appliesWhen,
  ].join(" ");
  const recordTokens = tokenize(haystack);
  let score = 0;
  for (const token of queryTokens) {
    if (recordTokens.has(token)) score += 2;
    if (record.intents.some((intent) => intent.includes(token) || token.includes(intent))) score += 3;
    if (record.domain.includes(token)) score += 3;
  }
  return score;
}

async function retrievePlanCorpus(input: {
  request: string;
  projectName?: string;
  conversation?: string;
  memories: Array<z.infer<typeof memorySchema>>;
}) {
  const corpus = await loadPlanCorpus();
  const memoryText = input.memories
    .map((memory) => `${memory.kind ?? ""} ${memory.title ?? ""} ${memory.body ?? ""}`)
    .join("\n");
  const query = [input.request, input.projectName, input.conversation, memoryText].filter(Boolean).join("\n");
  const tokens = tokenize(query);
  return corpus
    .map((record) => ({ record, score: scoreRecord(record, tokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ record }) => record);
}

function renderCorpus(records: CorpusRecord[]) {
  if (!records.length) return "No corpus records matched.";
  return records
    .map((record) =>
      [
        `- ${record.id} (${record.domain})`,
        `  Intents: ${record.intents.join(", ")}`,
        `  Useful questions: ${record.questionPatterns.join(" | ")}`,
        `  Chip examples: ${record.chipExamples.join(", ")}`,
        `  Applies when: ${record.appliesWhen.join(" ")}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderMemories(memories: Array<z.infer<typeof memorySchema>>) {
  const lines = memories
    .filter((memory) => memory.body || memory.title)
    .slice(0, 8)
    .map((memory) =>
      `- ${memory.kind ?? "memory"}: ${memory.title ?? "Untitled"} | ${memory.body ?? ""}${
        typeof memory.confidence === "number" ? ` | confidence=${memory.confidence.toFixed(2)}` : ""
      }`,
    );
  return lines.length ? lines.join("\n") : "No project preference memories provided.";
}

function similarQuestion(a: string, b: string) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap >= Math.min(4, Math.max(2, Math.floor(Math.min(aTokens.size, bTokens.size) / 2)));
}

function hasEnoughIntake(input: z.infer<typeof intakeRequestSchema>) {
  const text = `${input.request}\n${input.conversation ?? ""}`.toLowerCase();
  const hasAudience = /\b(audience|customer|segment|market|mid-market|smb|enterprise|prospect|user)\b/.test(text);
  const hasConstraint = /\b(budget|capacity|team|timeline|week|month|deadline|under \$|low paid|constraint)\b/.test(text);
  const hasSuccess = /\b(success|goal|metric|qualified|demo|pipeline|revenue|activation|conversion)\b/.test(text);
  const hasChannel = /\b(linkedin|email|outbound|webinar|content|partner|seo|paid|sales)\b/.test(text);
  return input.previousQuestions.length >= 4 || (input.previousQuestions.length >= 3 && hasAudience && hasConstraint && hasSuccess && hasChannel);
}

function fallbackIntake(input: z.infer<typeof intakeRequestSchema>, records: CorpusRecord[]) {
  if (hasEnoughIntake(input)) {
    return {
      question: "I have enough context to draft the editable plan now.",
      chips: [],
      ready: true,
      rationale: "The request and intake answers include audience, constraints, success criteria, and channel assumptions.",
      memorySignals: input.memories
        .filter((memory) => memory.kind === "preference" && (memory.title || memory.body))
        .map((memory) => `${memory.title ?? "Preference"}: ${memory.body ?? ""}`)
        .slice(0, 2),
    };
  }

  const previous = input.previousQuestions;
  const candidate = records
    .flatMap((record) =>
      record.questionPatterns.map((question) => ({
        question,
        chips: record.chipExamples,
        domain: record.domain,
      })),
    )
    .find((item) => !previous.some((question) => similarQuestion(question, item.question)));

  return {
    question: candidate?.question ?? "What constraint should shape this plan most?",
    chips: (candidate?.chips ?? ["Timeline", "Budget", "Team capacity", "Approval risk"]).slice(0, 4),
    ready: false,
    rationale: candidate
      ? `Fallback selected a non-repeated ${candidate.domain} corpus question.`
      : "Fallback selected a general constraint question.",
    memorySignals: input.memories
      .filter((memory) => memory.kind === "preference" && (memory.title || memory.body))
      .map((memory) => `${memory.title ?? "Preference"}: ${memory.body ?? ""}`)
      .slice(0, 2),
  };
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

plan.post("/intake", async (c) => {
  const parsed = intakeRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid plan intake request." }, 400);
  }

  const model = await resolveModel(c, parsed.data.model);
  if (!model) {
    return c.json({ code: "MODEL_NOT_AVAILABLE", message: "Connect a model to draft plan questions." }, 503);
  }

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const agentBrain = await agentFilesPromptBlock();
  const records = await retrievePlanCorpus(parsed.data);

  const system =
    "You are the organic Plan Mode intake engine for Dexter. Return strict JSON only. Ask exactly one natural, context-aware clarifying question unless enough context already exists. Use the retrieved corpus as inspiration, not as a script. Adapt to the user's firm, memories, and previous answers. Do not draft the plan. Do not execute anything.";
  const user = `Plan request:
${parsed.data.request}

Project:
${parsed.data.projectName ?? "Current project"}

Conversation so far:
${parsed.data.conversation || "No prior intake conversation."}

Previous questions to avoid repeating:
${parsed.data.previousQuestions.length ? parsed.data.previousQuestions.map((q) => `- ${q}`).join("\n") : "None"}

Relevant preference memories:
${renderMemories(parsed.data.memories)}

Firm context:
${firmBlock}

${agentBrain ? `Agent brain:\n${agentBrain}\n` : ""}
Retrieved planning corpus:
${renderCorpus(records)}

Return ONLY strict JSON:
{
  "question": "one concise conversational question, or a short ready sentence",
  "chips": ["2-4 short answer choices when useful, otherwise empty"],
  "ready": false,
  "rationale": "brief internal reason for this question",
  "memorySignals": ["preference memories that influenced the question"]
}

Readiness rules:
- Set ready=true when the conversation has enough goal, audience/scope, constraints, and success criteria to draft a credible editable plan.
- Ask at most one question.
- Do not repeat previous questions.
- Prefer a question that would materially change the plan.
- Chips must match the question and stay under 120 characters each.`;

  try {
    const content =
      model.provider === "moonshot"
        ? await createMoonshotChatCompletion({
            apiKey: model.apiKey ?? "",
            baseUrl: model.baseUrl ?? resolveMoonshotBaseUrl(),
            model: model.model,
            system,
            user,
            temperature: 0.45,
            maxTokens: 900,
          })
        : await createOllamaChatCompletion({
            baseUrl: resolveOllamaBaseUrl(),
            model: model.model,
            system,
            user,
            temperature: 0.35,
          });

    let result: ReturnType<typeof sanitizeIntake>;
    try {
      result = sanitizeIntake(parseModelJson(content));
    } catch (parseError) {
      console.warn("Plan intake JSON parse failed; using corpus fallback.", parseError);
      result = sanitizeIntake(fallbackIntake(parsed.data, records));
    }
    return c.json({
      provider: model.provider,
      model: model.model,
      retrievedCorpus: records.map((record) => record.id),
      intake: result,
    });
  } catch (error) {
    console.error("Plan intake error:", error);
    return c.json(
      { code: "PLAN_INTAKE_FAILED", message: error instanceof Error ? error.message : "Failed to draft intake question." },
      500,
    );
  }
});

export { plan };
