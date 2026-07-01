import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  createOllamaChatCompletion,
  resolveOllamaBaseUrl,
  resolveOllamaModel,
  validateOllamaModel,
} from "../lib/ollama.js";
import {
  resolveMoonshotApiKey,
  resolveMoonshotBaseUrl,
  resolveMoonshotModel,
  validateMoonshotApiKey,
} from "../lib/auth.js";
import { createMoonshotChatCompletion } from "../lib/moonshot.js";
import { loadNexusDesignBrief } from "../lib/artifact-design.js";

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

const skills = [
  {
    id: "project_context_retrieval",
    name: "Project context retrieval",
    description: "Builds a compact context pack from chat, tasks, board, briefs, team, datasets, and memory.",
    scope: "project",
    risk: "low",
    requiredTools: ["inspect_project_context"],
  },
  {
    id: "brief_artifact_delivery",
    name: "Brief artifact delivery",
    description: "Plans, drafts, audits, and exports evidence-backed HTML brief artifacts.",
    scope: "project",
    risk: "medium",
    requiredTools: ["inspect_dataset", "create_brief_artifact", "audit_artifact"],
  },
  {
    id: "task_proposal",
    name: "Task proposal",
    description: "Turns source-backed findings into approval-gated tasks and board changes.",
    scope: "project",
    risk: "medium",
    requiredTools: ["propose_work"],
  },
  {
    id: "gateway_triage",
    name: "Gateway triage",
    description: "Normalizes chat, webhook, Slack, GitHub, and email ingress into one project run ledger.",
    scope: "gateway",
    risk: "low",
    requiredTools: ["route_gateway_message", "inspect_project_context"],
  },
  {
    id: "memory_reflection",
    name: "Memory reflection",
    description: "Captures durable facts, preferences, and evidence notes after agent runs.",
    scope: "project",
    risk: "low",
    requiredTools: ["write_project_memory"],
  },
];

const agentRunEvents = new Map<string, Array<Record<string, unknown>>>();

const agentRunRequestSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  gatewayMessageId: z.string().optional(),
  request: z.string().min(1),
  intent: z
    .enum(["conversation", "brief", "task_proposal", "gateway_notification"])
    .optional(),
  outputKind: z
    .enum(["conversation", "tool_call", "plan", "artifact", "task_proposal", "gateway_notification"])
    .optional(),
  model: z.string().optional(),
});

const approvalRequestSchema = z.object({
  action: z.string().default("approve"),
  note: z.string().optional(),
});

function classifyAgentRequest(request: string) {
  const input = request.toLowerCase();
  if (/\b(brief|memo|report|artifact|pdf|html)\b/.test(input)) return "brief";
  if (/\b(task|todo|assign|owner|board|follow[- ]?up)\b/.test(input)) return "task_proposal";
  if (/\b(webhook|slack|github|email|notify|gateway)\b/.test(input)) return "gateway_notification";
  return "conversation";
}

agent.get("/skills", (c) => c.json({ skills }));

agent.post("/runs", async (c) => {
  const body = agentRunRequestSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  const intent = body.intent ?? classifyAgentRequest(body.request);
  const run = {
    id: `brain-run-${crypto.randomUUID().slice(0, 8)}`,
    projectId: body.projectId,
    sessionId: body.sessionId,
    gatewayMessageId: body.gatewayMessageId,
    title: `${intent.replace(/_/g, " ")} run`,
    request: body.request,
    intent,
    status: "running",
    trustLevel: 0,
    currentStage: "retrieve_context",
    contextPackId: `ctx-${crypto.randomUUID().slice(0, 8)}`,
    outputKind:
      body.outputKind ??
      (intent === "brief"
        ? "plan"
        : intent === "task_proposal"
          ? "task_proposal"
          : intent === "gateway_notification"
            ? "gateway_notification"
            : "conversation"),
    model: body.model,
    createdAt: now,
    updatedAt: now,
  };
  const events = [
    {
      id: `event-${crypto.randomUUID().slice(0, 8)}`,
      runId: run.id,
      stage: "ingest",
      title: "Request received",
      detail: "Gateway/chat request normalized into the Nexus agent run ledger.",
      status: "completed",
      createdAt: now,
    },
    {
      id: `event-${crypto.randomUUID().slice(0, 8)}`,
      runId: run.id,
      stage: "classify",
      title: "Intent classified",
      detail: `Intent classified as ${intent.replace(/_/g, " ")}.`,
      status: "completed",
      createdAt: now,
    },
    {
      id: `event-${crypto.randomUUID().slice(0, 8)}`,
      runId: run.id,
      stage: "retrieve_context",
      title: "Context retrieval queued",
      detail: "The browser-local context engine should attach project data, memory, and evidence.",
      status: "running",
      createdAt: now,
    },
  ];
  agentRunEvents.set(run.id, events);
  return c.json({ run, events });
});

agent.get("/runs/:id/events", (c) => {
  const runId = c.req.param("id");
  return c.json({ runId, events: agentRunEvents.get(runId) ?? [] });
});

agent.post("/runs/:id/approve", async (c) => {
  const runId = c.req.param("id");
  const body = approvalRequestSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date().toISOString();
  const approval = {
    id: `approval-${crypto.randomUUID().slice(0, 8)}`,
    runId,
    action: body.action,
    note: body.note,
    status: "approved",
    createdAt: now,
    resolvedAt: now,
  };
  const events = agentRunEvents.get(runId) ?? [];
  events.push({
    id: `event-${crypto.randomUUID().slice(0, 8)}`,
    runId,
    stage: "execute_tools",
    title: "Approval received",
    detail: body.note ?? "User approved the gated step.",
    status: "completed",
    createdAt: now,
  });
  agentRunEvents.set(runId, events);
  return c.json({ approval, events });
});

function parseModelJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const json = findBalancedJsonObject(candidate) ?? findBalancedJsonObject(content);
  if (!json) {
    throw new Error("The model did not return JSON.");
  }
  return JSON.parse(json) as unknown;
}

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
  takeaways: z.array(z.string().min(8)).min(1).max(5),
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

const briefIntentSchema = z.enum([
  "executive_decision",
  "operational_review",
  "risk_compliance",
  "market_intelligence",
  "performance_snapshot",
  "action_plan",
]);

const briefDesignTemplateSchema = z.enum([
  "executive_board",
  "ops_command",
  "risk_compliance",
]);

const briefResponseSchema = z.object({
  title: z.string().min(8).max(140),
  briefIntent: briefIntentSchema.default("executive_decision"),
  designTemplate: briefDesignTemplateSchema.default("executive_board"),
  executiveSummary: z.string().min(80),
  thesis: z.string().min(40),
  takeaways: z.array(z.string().min(8)).min(1).max(5),
  findings: z
    .array(
      z.object({
        claim: z.string().min(12),
        citationIds: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1).default(0.72),
        assumption: z.boolean().optional(),
      }),
    )
    .min(1)
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
    .min(1)
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

function ensureMinLength(value: string, minimum: number) {
  const normalized = normalizeModelText(value);
  if (normalized.length >= minimum) return normalized;
  return `${normalized} This statement is preserved from the model narrative and requires evidence review before publishing.`.slice(0, Math.max(minimum, normalized.length + 120));
}

function firstSentences(value: string, count: number) {
  const sentences = normalizeModelText(value)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
  return sentences || normalizeModelText(value).slice(0, 500);
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/\n/g, "\\n")}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, " ");
  }
}

function extractStringField(content: string, field: string) {
  const match = content.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  return match ? normalizeModelText(decodeJsonString(match[1])) : "";
}

function extractStringArrayField(content: string, field: string) {
  const match = content.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)]
    .map((item) => normalizeModelText(decodeJsonString(item[1])))
    .filter(Boolean)
    .slice(0, 5);
}

function cleanModelNarrative(content: string) {
  const extracted = [
    extractStringField(content, "executiveSummary"),
    extractStringField(content, "thesis"),
    ...extractStringArrayField(content, "takeaways"),
  ].filter(Boolean);
  if (extracted.length) return normalizeModelText(extracted.join(" "));

  return normalizeModelText(
    content
      .replace(/```(?:json)?/gi, " ")
      .replace(/```/g, " ")
      .replace(/"[^"]+"\s*:/g, " ")
      .replace(/[{}\[\],]/g, " "),
  );
}

function salvageBriefResponseFromModelText(content: string): BriefResponse {
  const narrative = ensureMinLength(cleanModelNarrative(content), 120);
  const summary = ensureMinLength(extractStringField(content, "executiveSummary") || firstSentences(narrative, 4), 80);
  const thesis = ensureMinLength(extractStringField(content, "thesis") || firstSentences(narrative, 2), 40);
  const takeaways = extractStringArrayField(content, "takeaways");
  const finding = ensureMinLength(extractStringField(content, "claim") || firstSentences(narrative, 1), 12);
  const recommendation = ensureMinLength(extractStringField(content, "action") || "Review the preserved model narrative against the evidence appendix before publishing.", 12);

  return briefResponseSchema.parse({
    title: extractStringField(content, "title") || "Model-written brief narrative",
    briefIntent: "risk_compliance",
    designTemplate: "risk_compliance",
    executiveSummary: summary,
    thesis,
    takeaways: [
      ...(takeaways.length ? takeaways : [ensureMinLength(firstSentences(narrative, 1), 8)]),
      "Model narrative was preserved after non-strict JSON and should be checked against evidence.",
      "Deterministic Nexus charts, tables, and audit blocks remain the publishing source of truth.",
    ].slice(0, 5),
    findings: [
      {
        claim: finding,
        citationIds: [],
        confidence: 0.62,
        assumption: true,
      },
    ],
    recommendations: [
      {
        action: recommendation,
        priority: "medium",
        expectedImpact: extractStringField(content, "expectedImpact") || "Keeps the model contribution available while preserving audit discipline.",
        sourceIds: [],
      },
    ],
    sectionNarratives: [
      {
        sectionTitle: "Model Narrative",
        body: narrative.slice(0, 1800),
        takeaways: [ensureMinLength(firstSentences(narrative, 1), 8)],
      },
    ],
    modelNotes: "Model returned non-strict JSON; Nexus preserved its narrative and marked unsupported items for review.",
  });
}

function normalizeBriefResponse(parsed: BriefResponse): BriefResponse {
  return {
    title: normalizeModelText(parsed.title),
    briefIntent: parsed.briefIntent,
    designTemplate: parsed.designTemplate,
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

type BriefProvider = "moonshot" | "ollama";

interface BriefModelConfig {
  provider: BriefProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

async function resolveBriefModel(c: Context, requestedModel?: string | null): Promise<BriefModelConfig | null> {
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
    return {
      provider: "ollama",
      model: ollamaModel,
    };
  }

  return null;
}

async function createStructuredBrief(options: {
  provider: BriefProvider;
  model: string;
  user: string;
  repair?: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  const system =
    options.provider === "moonshot"
      ? "You are Kimi running for Nexus. You write polished business research briefs from supplied evidence only. Never invent metrics, rows, chart values, task mutations, board changes, or source IDs. Return strict JSON only."
      : "You are Gemma 4 running locally for Nexus. You write polished business research briefs from supplied evidence only. Never invent metrics, rows, chart values, task mutations, board changes, or source IDs. Return strict JSON only.";
  const user = options.repair
    ? `${options.user}\n\nThe previous response failed validation:\n${options.repair}\n\nReturn corrected strict JSON only.`
    : options.user;
  const content =
    options.provider === "moonshot"
      ? await createMoonshotChatCompletion({
          apiKey: options.apiKey ?? "",
          baseUrl: options.baseUrl ?? resolveMoonshotBaseUrl(),
          model: options.model,
          system,
          user,
          temperature: options.model.startsWith("kimi-k2.7") ? 1 : options.repair ? 0.1 : undefined,
          maxTokens: options.repair ? 3200 : 4200,
        })
      : await createOllamaChatCompletion({
          baseUrl: resolveOllamaBaseUrl(),
          model: options.model,
          system,
          user,
          temperature: options.repair ? 0.05 : 0.15,
        });

  try {
    return briefResponseSchema.parse(parseModelJson(content));
  } catch (error) {
    if (options.repair) return salvageBriefResponseFromModelText(content);
    const repair = error instanceof Error ? error.message : "The response did not match the schema.";
    return createStructuredBrief({
      provider: options.provider,
      model: options.model,
      user: `${options.user}\n\nInvalid response that must be repaired:\n${content.slice(0, 5000)}`,
      repair,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
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

  const briefModel = await resolveBriefModel(c, body.data.model);
  if (!briefModel) {
    return c.json(
      {
        used: false,
        code: "MODEL_NOT_AVAILABLE",
        message: "No configured Moonshot/Kimi key or local Ollama model is available for brief generation.",
        model: body.data.model,
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
  const designBrief = await loadNexusDesignBrief();

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

Design brief the agent must remember:
${designBrief}

Rules:
- Keep all numerical claims exactly as supplied by evidence or tool trace.
- citationIds and sourceIds must be selected only from the allowed evidence IDs above.
- If a useful idea has no evidence ID, set assumption to true and leave citationIds empty.
- Use the design brief for tone and HTML presentation intent, but do not invent operating metrics, customer counts, competitor facts, or project facts.
- Choose briefIntent from executive_decision, operational_review, risk_compliance, market_intelligence, performance_snapshot, action_plan.
- Choose designTemplate from executive_board, ops_command, risk_compliance. Match executive/board/strategy requests to executive_board, ops/status/execution requests to ops_command, and audit/risk/compliance requests to risk_compliance.
- Do not mention task, board, owner, or roadmap changes as already applied.
- Return only JSON with this shape:
{
  "title": "brief title",
  "briefIntent": "executive_decision",
  "designTemplate": "executive_board",
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
    const parsed = await createStructuredBrief({ ...briefModel, user });
    return c.json({
      used: true,
      provider: briefModel.provider,
      model: briefModel.model,
      ...normalizeBriefResponse(parsed),
    });
  } catch (error) {
    console.error("Agent model brief error:", error);
    return c.json({
      used: false,
      code: "MODEL_BRIEF_FAILED",
      message: error instanceof Error ? error.message : "Failed to generate brief with the configured model.",
      model: briefModel.model,
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
      let activeModel = resolveMoonshotModel(body.data.model);
      try {
        const briefModel = await resolveBriefModel(c, body.data.model);
        if (briefModel) activeModel = briefModel.model;
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
        const designBrief = await loadNexusDesignBrief();
        writeEvent(controller, "design_brief_loaded", {
          label: "Design brief loaded",
          detail: "Nexus design.md is attached for artifact presentation, visual tone, and report styling rules.",
        });

        if (!briefModel) {
          writeEvent(controller, "artifact_error", {
            label: "Model unavailable",
            detail: "No configured Moonshot/Kimi key or local Ollama model is available. Publishing deterministic artifact fallback.",
            model: body.data.model,
          });
          writeEvent(controller, "artifact_created", {
            label: "Artifact created",
            detail: "Deterministic Nexus artifact is ready for review.",
            brief: {
              used: false,
              model: body.data.model,
              message: "No configured Moonshot/Kimi key or local Ollama model is available.",
            },
          });
          controller.close();
          return;
        }

        writeEvent(controller, "drafting_html_artifact", {
          label: "Drafting HTML artifact",
          detail:
            briefModel.provider === "moonshot"
              ? `${briefModel.model} is writing the report narrative from Nexus evidence.`
              : "Gemma is writing the report narrative from Nexus evidence.",
          model: briefModel.model,
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

Design brief the agent must remember:
${designBrief}

Rules:
- Create the artifact. Do not ask clarifying questions.
- Keep all numerical claims exactly as supplied by evidence or tool trace.
- citationIds and sourceIds must be selected only from the allowed evidence IDs above.
- If a useful idea has no evidence ID, set assumption to true and leave citationIds empty.
- Use the design brief for tone and HTML presentation intent, but do not invent operating metrics, customer counts, competitor facts, or project facts.
- Choose briefIntent from executive_decision, operational_review, risk_compliance, market_intelligence, performance_snapshot, action_plan.
- Choose designTemplate from executive_board, ops_command, risk_compliance. Match executive/board/strategy requests to executive_board, ops/status/execution requests to ops_command, and audit/risk/compliance requests to risk_compliance.
- Do not mention task, board, owner, or roadmap changes as already applied.
- Return only JSON with this shape:
{
  "title": "brief title",
  "briefIntent": "executive_decision",
  "designTemplate": "executive_board",
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
	  "modelNotes": "short note that the configured model wrote narrative from deterministic Nexus evidence"
	}`;

        const parsed = await createStructuredBrief({ ...briefModel, user });
        writeEvent(controller, "auditing_artifact", {
          label: "Auditing artifact",
          detail: "Checking evidence coverage, actionability, and publish readiness.",
        });
        writeEvent(controller, "artifact_created", {
          label: "Artifact created",
          detail: "The HTML artifact is ready for review.",
          brief: {
            used: true,
            provider: briefModel.provider,
            model: briefModel.model,
            ...normalizeBriefResponse(parsed),
          },
        });
      } catch (error) {
        console.error("Agent model brief stream error:", error);
        writeEvent(controller, "artifact_error", {
          label: "Model draft failed",
          detail: error instanceof Error ? error.message : "Failed to generate brief with the configured model.",
          model: activeModel,
        });
        writeEvent(controller, "artifact_created", {
          label: "Artifact created",
          detail: "Deterministic Nexus artifact is ready for review.",
          brief: {
            used: false,
            model: activeModel,
            message: error instanceof Error ? error.message : "Failed to generate brief with the configured model.",
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
