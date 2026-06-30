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

const insight = new Hono();

// The client computes the chartable numbers deterministically from REAL data and
// sends them here. This route asks the model to *read those numbers and decide
// the verdict* — status + headline + drivers — so the answer is a live analysis,
// not a template. The model must never invent figures; it only interprets the
// ones provided. `computedStatus` is a deterministic hint + the fallback.
const seriesPointSchema = z.object({
  date: z.string(),
  sales: z.number(),
  overhead: z.number(),
  net: z.number(),
});

const requestSchema = z.object({
  question: z.string().min(1),
  altitude: z.enum(["exec", "manager", "ic"]).default("exec"),
  projectName: z.string().optional(),
  datasetName: z.string().default("project data"),
  asOf: z.string().default(""),
  computedStatus: z.enum(["healthy", "watch", "at_risk"]).default("watch"),
  daysToNegative: z.number().nullable().optional(),
  kpis: z
    .array(
      z.object({
        label: z.string(),
        value: z.number().nullable().optional(),
        unit: z.enum(["currency", "days", "percent", "number"]).default("number"),
        deltaPct: z.number().optional(),
      }),
    )
    .default([]),
  window: z
    .object({
      days: z.number(),
      totalSales: z.number(),
      totalOverhead: z.number(),
      totalNet: z.number(),
      overheadPctOfSales: z.number().nullable().optional(),
    })
    .optional(),
  series: z.array(seriesPointSchema).default([]),
  model: z.string().optional(),
});

const verdictSchema = z.object({
  status: z.enum(["healthy", "watch", "at_risk"]).optional(),
  headline: z.string().optional().default(""),
  detail: z.string().optional().default(""),
  drivers: z.array(z.string()).default([]),
});

function fallbackHeadlineFor(status: "healthy" | "watch" | "at_risk") {
  return status === "at_risk"
    ? "Cash is trending toward zero — act on burn now."
    : status === "watch"
      ? "Holding positive, but the trend needs watching."
      : "Healthy — net is positive and cash is growing.";
}

function sanitizeVerdict(raw: unknown, fallbackStatus: "healthy" | "watch" | "at_risk") {
  const parsed = verdictSchema.parse(raw);
  const status = parsed.status ?? fallbackStatus;
  return {
    status,
    headline: (parsed.headline.trim() || fallbackHeadlineFor(status)).slice(0, 200),
    detail: parsed.detail.trim().slice(0, 600),
    drivers: parsed.drivers
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((d) => d.slice(0, 160)),
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

const ALTITUDE_VOICE: Record<"exec" | "manager" | "ic", string> = {
  exec:
    "The reader is a founder/executive. Lead with the bottom line and the risk answer in one crisp sentence — money and survival, not tactics. No hedging, no jargon.",
  manager:
    "The reader is a team manager. Give the bottom line plus the one lever that matters this week.",
  ic:
    "The reader is an individual contributor. Tie the numbers to what they should do next.",
};

function formatSeries(series: z.infer<typeof seriesPointSchema>[]): string {
  return series
    .map((p) => `${p.date}: sales $${p.sales}, overhead $${p.overhead}, net $${p.net}`)
    .join("\n");
}

insight.post("/", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid insight request." }, 400);
  }
  const data = parsed.data;

  // `source: "fallback"` tells the client the model didn't produce a usable
  // verdict, so it should keep its own grounded deterministic verdict (which
  // carries real drivers) rather than this bare placeholder.
  const respondFallback = (provider = "none", model = "none") =>
    c.json({
      provider,
      model,
      source: "fallback",
      verdict: {
        status: data.computedStatus,
        headline: fallbackHeadlineFor(data.computedStatus),
        detail: "",
        drivers: [],
      },
    });

  const model = await resolveModel(c, data.model);
  if (!model) return respondFallback();

  const firm = await loadFirmProfile();
  const firmBlock = firm ? firmProfileToPromptBlock(firm) : "No firm profile saved.";
  const agentBrain = await agentFilesPromptBlock();

  const kpiLines = data.kpis
    .map((k) => {
      const value = k.value == null ? "n/a" : k.value;
      const delta = k.deltaPct === undefined ? "" : ` (${k.deltaPct > 0 ? "+" : ""}${k.deltaPct}% vs prior)`;
      return `- ${k.label}: ${value}${k.unit === "currency" ? " (currency)" : k.unit === "days" ? " days" : k.unit === "percent" ? "%" : ""}${delta}`;
    })
    .join("\n");

  const w = data.window;
  const windowBlock = w
    ? `Last ${w.days} days — total sales $${w.totalSales}, total overhead $${w.totalOverhead}, total net $${w.totalNet}${
        w.overheadPctOfSales != null ? `, overhead is ${w.overheadPctOfSales}% of sales` : ""
      }.`
    : "No window summary provided.";

  const system =
    "You are Dexter, a sharp financial analyst writing an executive briefing verdict. You are given REAL daily figures, pre-computed metrics, and a deterministic status hint. Read the actual numbers and decide the verdict yourself: choose status (healthy / watch / at_risk) and write a grounded headline, a short detail, and 2-3 drivers. Rules: cite ONLY the numbers provided — never invent or alter a figure; if margins are thin or the trend is down, say so plainly; answer the reader's actual question. Respond with a single JSON object and nothing else — no prose, no markdown, no code fences. " +
    ALTITUDE_VOICE[data.altitude];

  const user = `Reader's question:
${data.question}

Dataset: ${data.datasetName}${data.asOf ? ` (as of ${data.asOf})` : ""}
Deterministic status hint: ${data.computedStatus}${
    data.daysToNegative != null ? ` — projected cash balance crosses $0 in ~${data.daysToNegative} days` : " — no projected cash cliff in the 14-day projection"
  }

${windowBlock}

Headline metrics:
${kpiLines || "None provided."}

Recent daily series (real):
${formatSeries(data.series) || "No series provided."}

Firm context:
${firmBlock}
${agentBrain ? `\n${agentBrain}\n` : ""}
Return ONLY strict JSON:
{
  "status": "healthy | watch | at_risk",
  "headline": "one direct sentence answering the question, grounded in the numbers above",
  "detail": "one optional sentence of context, or empty string",
  "drivers": ["2-3 short factual drivers, each citing a number from above"]
}`;

  const callModel = () =>
    model.provider === "moonshot"
      ? createMoonshotChatCompletion({
          apiKey: model.apiKey ?? "",
          baseUrl: model.baseUrl ?? resolveMoonshotBaseUrl(),
          model: model.model,
          system,
          user,
          temperature: 0.5,
          maxTokens: 700,
          jsonMode: true,
        })
      : createOllamaChatCompletion({
          baseUrl: resolveOllamaBaseUrl(),
          model: model.model,
          system,
          user,
          temperature: 0.4,
        });

  // Kimi occasionally returns empty/non-JSON content; one retry makes the
  // LLM verdict reliable before we settle for the deterministic fallback.
  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const content = await callModel();
      try {
        const verdict = sanitizeVerdict(parseModelJson(content), data.computedStatus);
        return c.json({ provider: model.provider, model: model.model, source: "llm", verdict });
      } catch (parseError) {
        console.warn(`Insight verdict parse failed (attempt ${attempt}/2).`, parseError);
      }
    }
    return respondFallback(model.provider, model.model);
  } catch (error) {
    console.error("Insight verdict error:", error);
    return respondFallback();
  }
});

export { insight };
