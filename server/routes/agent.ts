import { Hono } from "hono";
import { z } from "zod";
import {
  createOllamaChatCompletion,
  resolveOllamaBaseUrl,
  resolveOllamaModel,
  validateOllamaModel,
} from "../lib/ollama.js";

const agent = new Hono();

const tools = [
  "inspect_dataset",
  "profile_metrics",
  "query_dataset",
  "compare_segments",
  "trend_analysis",
  "effectiveness_analysis",
  "generate_visual_blocks",
  "create_brief_artifact",
  "audit_artifact",
  "propose_work",
].map((id) => ({
  id,
  risk: id === "propose_work" || id === "effectiveness_analysis" ? "medium" : "low",
  approvalMode: id === "propose_work" ? "review_before_apply" : "none",
}));

agent.get("/tools", (c) => c.json({ tools }));

function parseModelJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Ollama did not return JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function normalizeModelText(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const polishRequestSchema = z.object({
  prompt: z.string().min(1),
  domainId: z.string().optional(),
  model: z.string().optional(),
  draft: z.object({
    title: z.string(),
    summary: z.string(),
    thesis: z.string(),
    findings: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
  }),
  evidence: z
    .array(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        confidence: z.number().optional(),
      }),
    )
    .default([]),
});

const polishResponseSchema = z.object({
  summary: z.string().min(40),
  thesis: z.string().min(40),
  takeaways: z.array(z.string().min(8)).min(3).max(5),
  modelNote: z.string().min(8).max(160),
});

agent.post("/run", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.prompt !== "string") {
    return c.json({ code: "INVALID_REQUEST", message: "Missing prompt." }, 400);
  }

  const datasets = Array.isArray(body.datasets) ? body.datasets : [];
  const rows = datasets.reduce((count, dataset) => count + (Array.isArray(dataset.rows) ? dataset.rows.length : 0), 0);

  return c.json({
    status: "accepted",
    mode: "local-first",
    summary:
      "Agent runtime request accepted. The current browser client executes the deterministic local tool pass with project datasets.",
    trace: {
      prompt: body.prompt,
      datasetCount: datasets.length,
      rowCount: rows,
      tools: tools.map((tool) => tool.id),
    },
  });
});

agent.post("/polish", async (c) => {
  const body = polishRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ used: false, code: "INVALID_REQUEST", message: "Invalid polish request." }, 400);
  }

  const model = resolveOllamaModel(body.data.model);
  const valid = await validateOllamaModel(model);
  if (!valid) {
    return c.json(
      {
        used: false,
        code: "OLLAMA_MODEL_NOT_FOUND",
        message: `Ollama model ${model} is not available locally.`,
        model,
      },
      200,
    );
  }

  const evidence = body.data.evidence
    .slice(0, 6)
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} (${Math.round((source.confidence ?? 0.7) * 100)}%): ${source.excerpt}`,
    )
    .join("\n");

  const user = `Create a polished executive version of this Nexus structured brief.

User request:
${body.data.prompt}

Title:
${body.data.draft.title}

Current summary:
${body.data.draft.summary}

Current thesis:
${body.data.draft.thesis}

Findings:
${body.data.draft.findings.map((finding) => `- ${finding}`).join("\n")}

Recommendations:
${body.data.draft.recommendations.map((recommendation) => `- ${recommendation}`).join("\n")}

Evidence:
${evidence}

Return only JSON with:
{
  "summary": "120-180 word executive summary grounded only in the evidence",
  "thesis": "one concise thesis paragraph",
  "takeaways": ["3 to 5 concise source-backed takeaways"],
  "modelNote": "short note that local Ollama assisted the narrative polish"
}`;

  try {
    const content = await createOllamaChatCompletion({
      baseUrl: resolveOllamaBaseUrl(),
      model,
      system:
        "You are a local Nexus report writer. Preserve numerical claims exactly, do not invent facts, and return strict JSON only.",
      user,
      temperature: 0.15,
    });
    const parsed = polishResponseSchema.parse(parseModelJson(content));
    return c.json({
      used: true,
      provider: "ollama",
      model,
      summary: normalizeModelText(parsed.summary),
      thesis: normalizeModelText(parsed.thesis),
      takeaways: parsed.takeaways.map(normalizeModelText),
      modelNote: normalizeModelText(parsed.modelNote),
    });
  } catch (error) {
    console.error("Agent Ollama polish error:", error);
    return c.json({
      used: false,
      code: "OLLAMA_POLISH_FAILED",
      message: error instanceof Error ? error.message : "Failed to polish brief with Ollama.",
      model,
    });
  }
});

export { agent };
