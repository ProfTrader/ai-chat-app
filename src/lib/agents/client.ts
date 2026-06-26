import type {
  AgentRun,
  ArtifactBlock,
  ArtifactClaim,
  DraftArtifact,
  EvidenceSource,
  WorkRun,
} from "@/types";
import { auditWorkRun } from "@/lib/artifacts/brief-loop";

interface ModelFinding {
  claim: string;
  citationIds: string[];
  confidence: number;
  assumption?: boolean;
}

interface ModelRecommendation {
  action: string;
  priority: "high" | "medium" | "low";
  expectedImpact: string;
  sourceIds: string[];
}

interface SectionNarrative {
  sectionTitle: string;
  body: string;
  takeaways?: string[];
}

interface AgentBriefResponse {
  used: boolean;
  provider?: "ollama";
  model?: string;
  title?: string;
  executiveSummary?: string;
  thesis?: string;
  takeaways?: string[];
  findings?: ModelFinding[];
  recommendations?: ModelRecommendation[];
  sectionNarratives?: SectionNarrative[];
  modelNotes?: string;
  message?: string;
}

export type ArtifactStreamEventName =
  | "understanding_request"
  | "retrieving_context"
  | "inspecting_evidence"
  | "drafting_html_artifact"
  | "auditing_artifact"
  | "artifact_created"
  | "artifact_error";

export interface ArtifactStreamEvent {
  event: ArtifactStreamEventName;
  at: string;
  data: {
    label?: string;
    detail?: string;
    model?: string;
    brief?: AgentBriefResponse;
  };
}

function summarizeBlock(block: ArtifactBlock) {
  if (block.type === "hero") {
    return {
      type: block.type,
      title: block.title,
      subtitle: block.subtitle,
    };
  }
  if (block.type === "summary") {
    return {
      type: block.type,
      title: block.title,
      body: block.body,
      takeaways: block.takeaways,
    };
  }
  if (block.type === "kpi_grid") {
    return {
      type: block.type,
      title: block.title,
      insight: block.insight,
      items: block.items,
      sourceIds: block.sourceIds,
    };
  }
  if (block.type === "chart") {
    return {
      type: block.type,
      title: block.chart.title,
      insight: block.chart.insight,
      sourceIds: block.chart.sourceIds,
    };
  }
  if (block.type === "table") {
    return {
      type: block.type,
      title: block.table.title,
      caption: block.table.caption,
      sourceIds: block.table.sourceIds,
    };
  }
  if (block.type === "finding") {
    return {
      type: block.type,
      title: block.title,
      claims: block.claims.map((claim) => ({
        claim: claim.claim,
        citationIds: claim.citationIds,
        assumption: claim.assumption,
      })),
    };
  }
  if (block.type === "recommendation") {
    return {
      type: block.type,
      title: block.title,
      recommendations: block.recommendations,
    };
  }
  return {
    type: block.type,
    title: block.title,
  };
}

export async function generateBriefWithLocalModel({
  workRun,
  agentRun,
}: {
  workRun: WorkRun;
  agentRun: AgentRun;
}): Promise<AgentBriefResponse> {
  const draft = workRun.drafts[workRun.drafts.length - 1];
  if (!draft) return { used: false, message: "No draft available to generate." };

  const response = await fetch("/api/agent/brief", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: workRun.request,
      domainId: workRun.domainId,
      model: agentRun.model,
      draft: {
        title: draft.title,
        summary: draft.summary,
        thesis: draft.thesis,
        style: draft.style,
        findings: draft.findings,
        recommendations: draft.recommendations,
        artifactSections:
          draft.artifactSections?.map((section) => ({
            title: section.title,
            purpose: section.purpose,
            blocks: section.blocks.map(summarizeBlock),
          })) ?? [],
      },
      evidence: workRun.evidence.map((source) => ({
        id: source.id,
        title: source.title,
        excerpt: source.excerpt,
        confidence: source.confidence,
      })),
      toolInvocations: agentRun.toolInvocations.map((tool) => ({
        toolName: tool.toolName,
        inputSummary: tool.inputSummary,
        outputSummary: tool.outputSummary,
        evidenceIds: tool.evidenceIds,
      })),
    }),
  });

  const data = (await response.json()) as AgentBriefResponse;
  if (!response.ok) {
    throw new Error(data.message ?? "Failed to generate brief with local model.");
  }
  return data;
}

function briefStreamPayload({ workRun, agentRun }: { workRun: WorkRun; agentRun: AgentRun }) {
  const draft = workRun.drafts[workRun.drafts.length - 1];
  if (!draft) throw new Error("No draft available to generate.");

  return {
    prompt: workRun.request,
    domainId: workRun.domainId,
    model: agentRun.model,
    context: {
      taskCount: agentRun.datasetIds.length,
    },
    draft: {
      title: draft.title,
      summary: draft.summary,
      thesis: draft.thesis,
      style: draft.style,
      findings: draft.findings,
      recommendations: draft.recommendations,
      artifactSections:
        draft.artifactSections?.map((section) => ({
          title: section.title,
          purpose: section.purpose,
          blocks: section.blocks.map(summarizeBlock),
        })) ?? [],
    },
    evidence: workRun.evidence.map((source) => ({
      id: source.id,
      title: source.title,
      excerpt: source.excerpt,
      confidence: source.confidence,
    })),
    toolInvocations: agentRun.toolInvocations.map((tool) => ({
      toolName: tool.toolName,
      inputSummary: tool.inputSummary,
      outputSummary: tool.outputSummary,
      evidenceIds: tool.evidenceIds,
    })),
  };
}

export async function streamBriefWithLocalModel({
  workRun,
  agentRun,
  onEvent,
}: {
  workRun: WorkRun;
  agentRun: AgentRun;
  onEvent?: (event: ArtifactStreamEvent) => void;
}): Promise<AgentBriefResponse> {
  const response = await fetch("/api/agent/brief-stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(briefStreamPayload({ workRun, agentRun })),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message ?? "Failed to stream brief artifact.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalBrief: AgentBriefResponse | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const event = JSON.parse(line) as ArtifactStreamEvent;
      onEvent?.(event);
      if (event.event === "artifact_created" && event.data.brief) {
        finalBrief = event.data.brief;
      }
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer.trim()) as ArtifactStreamEvent;
    onEvent?.(event);
    if (event.event === "artifact_created" && event.data.brief) {
      finalBrief = event.data.brief;
    }
  }

  return finalBrief ?? { used: false, message: "Brief stream ended without a model artifact." };
}

function validSourceIds(ids: string[] | undefined, evidenceIds: Set<string>) {
  return (ids ?? []).filter((id) => evidenceIds.has(id));
}

function toClaims(brief: AgentBriefResponse, evidenceIds: Set<string>): ArtifactClaim[] | null {
  if (!brief.findings?.length) return null;
  return brief.findings.map((finding, index) => {
    const citationIds = validSourceIds(finding.citationIds, evidenceIds);
    return {
      id: `claim-gemma-${index + 1}`,
      claim: finding.claim,
      confidence: finding.confidence,
      citationIds,
      assumption: finding.assumption || citationIds.length === 0,
    };
  });
}

function mergeBriefDraft({
  draft,
  brief,
  evidenceIds,
}: {
  draft: DraftArtifact;
  brief: AgentBriefResponse;
  evidenceIds: Set<string>;
}): DraftArtifact {
  if (!brief.used || !brief.executiveSummary || !brief.thesis) return draft;

  const claims = toClaims(brief, evidenceIds);
  const recommendations = brief.recommendations?.length
    ? brief.recommendations.map((recommendation) => recommendation.action)
    : draft.recommendations;
  const sectionNarratives = new Map(
    (brief.sectionNarratives ?? []).map((section) => [
      section.sectionTitle.toLowerCase(),
      section,
    ]),
  );

  return {
    ...draft,
    title: brief.title ?? draft.title,
    summary: brief.executiveSummary,
    thesis: brief.thesis,
    findings: claims?.map((claim) => claim.claim) ?? draft.findings,
    recommendations,
    citations:
      claims?.flatMap((claim, index) =>
        claim.citationIds.map((sourceId) => ({ label: `Gemma claim ${index + 1}`, sourceId })),
      ) ?? draft.citations,
    artifactSections: draft.artifactSections?.map((section) => {
      const narrative = sectionNarratives.get(section.title.toLowerCase());
      return {
        ...section,
        blocks: section.blocks.map((block) => {
          if (block.type === "hero") {
            return {
              ...block,
              title: brief.title ?? block.title,
              subtitle: brief.thesis ?? block.subtitle,
            };
          }
          if (block.type === "summary" && block.title.toLowerCase().includes("executive")) {
            return {
              ...block,
              body: brief.executiveSummary ?? block.body,
              takeaways: brief.takeaways?.length ? brief.takeaways : block.takeaways,
            };
          }
          if (block.type === "summary" && narrative) {
            return {
              ...block,
              body: narrative.body,
              takeaways: narrative.takeaways?.length ? narrative.takeaways : block.takeaways,
            };
          }
          if (block.type === "finding" && claims) {
            return {
              ...block,
              claims,
            };
          }
          if (block.type === "recommendation" && brief.recommendations?.length) {
            return {
              ...block,
              recommendations: brief.recommendations.map((recommendation) => ({
                priority: recommendation.priority,
                action: recommendation.action,
                expectedImpact: recommendation.expectedImpact,
                sourceIds: validSourceIds(recommendation.sourceIds, evidenceIds),
              })),
            };
          }
          if (block.type === "task_proposal" && brief.modelNotes) {
            return {
              ...block,
              body: `${block.body} ${brief.modelNotes}`,
            };
          }
          return block;
        }),
      };
    }),
  };
}

export function applyLocalModelBrief({
  workRun,
  agentRun,
  brief,
}: {
  workRun: WorkRun;
  agentRun: AgentRun;
  brief: AgentBriefResponse;
}): { workRun: WorkRun; agentRun: AgentRun } {
  if (!brief.used) return { workRun, agentRun };
  const latestDraft = workRun.drafts[workRun.drafts.length - 1];
  if (!latestDraft) return { workRun, agentRun };

  const evidenceIds = new Set(workRun.evidence.map((source) => source.id));
  const modelEvidence: EvidenceSource = {
    id: `ev-model-${crypto.randomUUID().slice(0, 8)}`,
    kind: "workspace",
    title: "Gemma 4 structured brief generation",
    source: brief.model ?? "Ollama local model",
    excerpt:
      brief.modelNotes ??
      "Gemma 4 wrote the brief narrative from deterministic Nexus tool evidence.",
    confidence: 0.74,
    linkedClaimIds: ["claim-gemma-brief-generation"],
  };
  const nextDraft = mergeBriefDraft({
    draft: latestDraft,
    brief,
    evidenceIds,
  });
  const nextWorkRun: WorkRun = {
    ...workRun,
    title: nextDraft.title,
    evidence: [...workRun.evidence, modelEvidence],
    drafts: [...workRun.drafts.slice(0, -1), nextDraft],
    updatedAt: new Date().toISOString(),
  };

  return {
    workRun: {
      ...nextWorkRun,
      audit: auditWorkRun(nextWorkRun),
    },
    agentRun: {
      ...agentRun,
      model: brief.model ?? agentRun.model,
      steps: [
        ...agentRun.steps,
        {
          id: `step-${crypto.randomUUID().slice(0, 8)}`,
          kind: "draft",
          title: "Gemma 4 structured brief",
          status: "completed",
          summary:
            brief.modelNotes ??
            `Generated structured brief narrative with ${brief.model ?? "local Ollama"}.`,
          createdAt: new Date().toISOString(),
        },
        {
          id: `step-${crypto.randomUUID().slice(0, 8)}`,
          kind: "audit",
          title: "Re-audit Gemma brief",
          status: "completed",
          summary: "Re-scored the artifact after merging the local model narrative.",
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    },
  };
}
