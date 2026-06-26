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

const briefRequestSchema = z.object({
  prompt: z.string().min(1),
  domainId: z.string().optional(),
  model: z.string().optional(),
  draft: z.object({
    title: z.string(),
    summary: z.string(),
    thesis: z.string(),
    style: z.string().optional(),
    findings: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
    artifactSections: z
      .array(
        z.object({
          title: z.string(),
          purpose: z.string().optional(),
          blocks: z.array(z.unknown()).default([]),
        }),
      )
      .default([]),
  }),
  evidence: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        excerpt: z.string(),
        confidence: z.number().optional(),
      }),
    )
    .default([]),
  toolInvocations: z
    .array(
      z.object({
        toolName: z.string(),
        inputSummary: z.string(),
        outputSummary: z.string(),
        evidenceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const briefStreamRequestSchema = briefRequestSchema.extend({
  context: z
    .object({
      projectName: z.string().optional(),
      taskCount: z.number().optional(),
      contactCount: z.number().optional(),
      sessionCount: z.number().optional(),
    })
    .optional(),
});

const briefResponseSchema = z.object({
  title: z.string().min(8).max(140),
  executiveSummary: z.string().min(80),
  thesis: z.string().min(40),
  takeaways: z.array(z.string().min(8)).min(3).max(5),
  findings: z
    .array(
      z.object({
        claim: z.string().min(12),
        citationIds: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1).default(0.72),
        assumption: z.boolean().optional(),
      }),
    )
    .min(3)
    .max(6),
  recommendations: z
    .array(
      z.object({
        action: z.string().min(12),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        expectedImpact: z.string().min(12),
        sourceIds: z.array(z.string()).default([]),
      }),
    )
    .min(3)
    .max(6),
  sectionNarratives: z
    .array(
      z.object({
        sectionTitle: z.string(),
        body: z.string().min(30),
        takeaways: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  modelNotes: z.string().min(8).max(220),
});

type BriefResponse = z.infer<typeof briefResponseSchema>;

function normalizeBriefResponse(parsed: BriefResponse): BriefResponse {
  return {
    title: normalizeModelText(parsed.title),
    executiveSummary: normalizeModelText(parsed.executiveSummary),
    thesis: normalizeModelText(parsed.thesis),
    takeaways: parsed.takeaways.map(normalizeModelText),
    findings: parsed.findings.map((finding) => ({
      ...finding,
      claim: normalizeModelText(finding.claim),
    })),
    recommendations: parsed.recommendations.map((recommendation) => ({
      ...recommendation,
      action: normalizeModelText(recommendation.action),
      expectedImpact: normalizeModelText(recommendation.expectedImpact),
    })),
    sectionNarratives: parsed.sectionNarratives.map((section) => ({
      sectionTitle: normalizeModelText(section.sectionTitle),
      body: normalizeModelText(section.body),
      takeaways: section.takeaways?.map(normalizeModelText),
    })),
    modelNotes: normalizeModelText(parsed.modelNotes),
  };
}

async function createStructuredBrief(options: {
  model: string;
  user: string;
  repair?: string;
}) {
  const content = await createOllamaChatCompletion({
    baseUrl: resolveOllamaBaseUrl(),
    model: options.model,
    system:
      "You are Gemma 4 running locally for Nexus. You write polished business research briefs from supplied evidence only. Never invent metrics, rows, chart values, task mutations, board changes, or source IDs. Return strict JSON only.",
    user: options.repair
      ? `${options.user}\n\nThe previous response failed validation:\n${options.repair}\n\nReturn corrected strict JSON only.`
      : options.user,
    temperature: options.repair ? 0.05 : 0.15,
  });

  try {
    return briefResponseSchema.parse(parseModelJson(content));
  } catch (error) {
    if (options.repair) throw error;
    const repair = error instanceof Error ? error.message : "The response did not match the schema.";
    return createStructuredBrief({
      model: options.model,
      user: `${options.user}\n\nInvalid response that must be repaired:\n${content.slice(0, 5000)}`,
      repair,
    });
  }
}

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

agent.post("/brief", async (c) => {
  const body = briefRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ used: false, code: "INVALID_REQUEST", message: "Invalid brief request." }, 400);
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
    .slice(0, 10)
    .map(
      (source) =>
        `- ${source.id}: ${source.title} (${Math.round((source.confidence ?? 0.7) * 100)}% confidence) - ${source.excerpt}`,
    )
    .join("\n");
  const toolTrace = body.data.toolInvocations
    .slice(0, 10)
    .map(
      (tool) =>
        `- ${tool.toolName}: ${tool.outputSummary} Evidence IDs: ${tool.evidenceIds.join(", ") || "none"}`,
    )
    .join("\n");
  const sectionSkeleton = body.data.draft.artifactSections
    .slice(0, 8)
    .map(
      (section) =>
        `- ${section.title}: ${section.purpose ?? "No stated purpose"} (${section.blocks.length} artifact blocks)`,
    )
    .join("\n");

  const user = `Write the structured Nexus brief narrative from this deterministic analysis.

User request:
${body.data.prompt}

Domain:
${body.data.domainId ?? "general"}

Current deterministic draft:
Title: ${body.data.draft.title}
Style: ${body.data.draft.style ?? "research_memo"}
Summary: ${body.data.draft.summary}
Thesis: ${body.data.draft.thesis}

Current findings:
${body.data.draft.findings.map((finding) => `- ${finding}`).join("\n")}

Current recommendations:
${body.data.draft.recommendations.map((recommendation) => `- ${recommendation}`).join("\n")}

Evidence IDs you are allowed to cite:
${evidence || "- No evidence supplied. Mark unsupported claims as assumptions."}

Tool trace:
${toolTrace || "- No tool trace supplied."}

Artifact section skeleton:
${sectionSkeleton || "- Use the existing Nexus report structure."}

Rules:
- Keep all numerical claims exactly as supplied by evidence or tool trace.
- citationIds and sourceIds must be selected only from the allowed evidence IDs above.
- If a useful idea has no evidence ID, set assumption to true and leave citationIds empty.
- Do not mention task, board, owner, or roadmap changes as already applied.
- Return only JSON with this shape:
{
  "title": "brief title",
  "executiveSummary": "120-180 word evidence-grounded summary",
  "thesis": "one concise thesis paragraph",
  "takeaways": ["3 to 5 crisp takeaways"],
  "findings": [
    { "claim": "source-backed claim", "citationIds": ["ev-id"], "confidence": 0.82, "assumption": false }
  ],
  "recommendations": [
    { "action": "reviewable action", "priority": "high", "expectedImpact": "expected business impact", "sourceIds": ["ev-id"] }
  ],
  "sectionNarratives": [
    { "sectionTitle": "Cover", "body": "section narrative", "takeaways": ["optional bullets"] }
  ],
  "modelNotes": "short note that Gemma 4 wrote narrative from deterministic Nexus evidence"
}`;

  try {
    const parsed = await createStructuredBrief({ model, user });
    return c.json({
      used: true,
      provider: "ollama",
      model,
      ...normalizeBriefResponse(parsed),
    });
  } catch (error) {
    console.error("Agent Ollama brief error:", error);
    return c.json({
      used: false,
      code: "OLLAMA_BRIEF_FAILED",
      message: error instanceof Error ? error.message : "Failed to generate brief with Ollama.",
      model,
    });
  }
});

agent.post("/brief-stream", async (c) => {
  const body = briefStreamRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ code: "INVALID_REQUEST", message: "Invalid brief stream request." }, 400);
  }

  const encoder = new TextEncoder();
  const writeEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data = {}) => {
    controller.enqueue(encoder.encode(`${JSON.stringify({ event, data, at: new Date().toISOString() })}\n`));
  };

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const model = resolveOllamaModel(body.data.model);

      try {
        writeEvent(controller, "understanding_request", {
          label: "Understanding request",
          detail: "Reading the user prompt and choosing the artifact shape.",
        });
        writeEvent(controller, "retrieving_context", {
          label: "Retrieving context",
          detail: `Using ${body.data.context?.projectName ?? "the selected project"} workspace context.`,
        });
        writeEvent(controller, "inspecting_evidence", {
          label: "Inspecting evidence",
          detail: `${body.data.evidence.length} evidence groups and ${body.data.toolInvocations.length} tool traces prepared.`,
        });

        const valid = await validateOllamaModel(model);
        if (!valid) {
          writeEvent(controller, "artifact_error", {
            label: "Local model unavailable",
            detail: `Ollama model ${model} is not available. Publishing deterministic artifact fallback.`,
            model,
          });
          writeEvent(controller, "artifact_created", {
            label: "Artifact created",
            detail: "Deterministic Nexus artifact is ready for review.",
            brief: { used: false, model, message: `Ollama model ${model} is not available locally.` },
          });
          controller.close();
          return;
        }

        writeEvent(controller, "drafting_html_artifact", {
          label: "Drafting HTML artifact",
          detail: `Gemma is writing the report narrative from Nexus evidence.`,
          model,
        });

        const evidence = body.data.evidence
          .slice(0, 10)
          .map(
            (source) =>
              `- ${source.id}: ${source.title} (${Math.round((source.confidence ?? 0.7) * 100)}% confidence) - ${source.excerpt}`,
          )
          .join("\n");
        const toolTrace = body.data.toolInvocations
          .slice(0, 10)
          .map(
            (tool) =>
              `- ${tool.toolName}: ${tool.outputSummary} Evidence IDs: ${tool.evidenceIds.join(", ") || "none"}`,
          )
          .join("\n");
        const sectionSkeleton = body.data.draft.artifactSections
          .slice(0, 8)
          .map(
            (section) =>
              `- ${section.title}: ${section.purpose ?? "No stated purpose"} (${section.blocks.length} artifact blocks)`,
          )
          .join("\n");

        const user = `Write the structured Nexus brief narrative from this deterministic analysis.

User request:
${body.data.prompt}

Domain:
${body.data.domainId ?? "general"}

Current deterministic draft:
Title: ${body.data.draft.title}
Style: ${body.data.draft.style ?? "research_memo"}
Summary: ${body.data.draft.summary}
Thesis: ${body.data.draft.thesis}

Current findings:
${body.data.draft.findings.map((finding) => `- ${finding}`).join("\n")}

Current recommendations:
${body.data.draft.recommendations.map((recommendation) => `- ${recommendation}`).join("\n")}

Evidence IDs you are allowed to cite:
${evidence || "- No evidence supplied. Mark unsupported claims as assumptions."}

Tool trace:
${toolTrace || "- No tool trace supplied."}

Artifact section skeleton:
${sectionSkeleton || "- Use the existing Nexus report structure."}

Rules:
- Create the artifact. Do not ask clarifying questions.
- Keep all numerical claims exactly as supplied by evidence or tool trace.
- citationIds and sourceIds must be selected only from the allowed evidence IDs above.
- If a useful idea has no evidence ID, set assumption to true and leave citationIds empty.
- Do not mention task, board, owner, or roadmap changes as already applied.
- Return only JSON with this shape:
{
  "title": "brief title",
  "executiveSummary": "120-180 word evidence-grounded summary",
  "thesis": "one concise thesis paragraph",
  "takeaways": ["3 to 5 crisp takeaways"],
  "findings": [
    { "claim": "source-backed claim", "citationIds": ["ev-id"], "confidence": 0.82, "assumption": false }
  ],
  "recommendations": [
    { "action": "reviewable action", "priority": "high", "expectedImpact": "expected business impact", "sourceIds": ["ev-id"] }
  ],
  "sectionNarratives": [
    { "sectionTitle": "Cover", "body": "section narrative", "takeaways": ["optional bullets"] }
  ],
  "modelNotes": "short note that Gemma 4 wrote narrative from deterministic Nexus evidence"
}`;

        const parsed = await createStructuredBrief({ model, user });
        writeEvent(controller, "auditing_artifact", {
          label: "Auditing artifact",
          detail: "Checking evidence coverage, actionability, and publish readiness.",
        });
        writeEvent(controller, "artifact_created", {
          label: "Artifact created",
          detail: "The HTML artifact is ready for review.",
          brief: {
            used: true,
            provider: "ollama",
            model,
            ...normalizeBriefResponse(parsed),
          },
        });
      } catch (error) {
        console.error("Agent Ollama brief stream error:", error);
        writeEvent(controller, "artifact_error", {
          label: "Gemma draft failed",
          detail: error instanceof Error ? error.message : "Failed to generate brief with Ollama.",
          model: resolveOllamaModel(body.data.model),
        });
        writeEvent(controller, "artifact_created", {
          label: "Artifact created",
          detail: "Deterministic Nexus artifact is ready for review.",
          brief: {
            used: false,
            model: resolveOllamaModel(body.data.model),
            message: error instanceof Error ? error.message : "Failed to generate brief with Ollama.",
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
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
