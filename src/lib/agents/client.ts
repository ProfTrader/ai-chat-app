import type { AgentRun, DraftArtifact, EvidenceSource, WorkRun } from "@/types";

interface AgentPolishResponse {
  used: boolean;
  provider?: "ollama";
  model?: string;
  summary?: string;
  thesis?: string;
  takeaways?: string[];
  modelNote?: string;
  message?: string;
}

export async function polishBriefWithLocalModel({
  workRun,
  agentRun,
}: {
  workRun: WorkRun;
  agentRun: AgentRun;
}): Promise<AgentPolishResponse> {
  const draft = workRun.drafts[workRun.drafts.length - 1];
  if (!draft) return { used: false, message: "No draft available to polish." };

  const response = await fetch("/api/agent/polish", {
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
        findings: draft.findings,
        recommendations: draft.recommendations,
      },
      evidence: workRun.evidence.map((source) => ({
        title: source.title,
        excerpt: source.excerpt,
        confidence: source.confidence,
      })),
    }),
  });

  const data = (await response.json()) as AgentPolishResponse;
  if (!response.ok) {
    throw new Error(data.message ?? "Failed to polish brief with local model.");
  }
  return data;
}

function polishDraft(draft: DraftArtifact, polish: AgentPolishResponse): DraftArtifact {
  if (!polish.used || !polish.summary || !polish.thesis) return draft;
  const summary = polish.summary;
  const thesis = polish.thesis;

  return {
    ...draft,
    summary,
    thesis,
    artifactSections: draft.artifactSections?.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (block.type === "hero") {
          return { ...block, subtitle: thesis };
        }
        if (block.type === "summary" && block.title.toLowerCase().includes("executive")) {
          return {
            ...block,
            body: summary,
            takeaways: polish.takeaways?.length ? polish.takeaways : block.takeaways,
          };
        }
        if (block.type === "task_proposal" && polish.modelNote) {
          return {
            ...block,
            body: `${block.body} ${polish.modelNote}`,
          };
        }
        return block;
      }),
    })),
  };
}

export function applyLocalModelPolish({
  workRun,
  agentRun,
  polish,
}: {
  workRun: WorkRun;
  agentRun: AgentRun;
  polish: AgentPolishResponse;
}): { workRun: WorkRun; agentRun: AgentRun } {
  if (!polish.used) return { workRun, agentRun };
  const latestDraft = workRun.drafts[workRun.drafts.length - 1];
  const modelEvidence: EvidenceSource = {
    id: `ev-model-${crypto.randomUUID().slice(0, 8)}`,
    kind: "workspace",
    title: "Local Ollama narrative polish",
    source: polish.model ?? "Ollama local model",
    excerpt: polish.modelNote ?? "Local model polished the report narrative without changing tool evidence.",
    confidence: 0.72,
    linkedClaimIds: ["claim-local-model-polish"],
  };

  return {
    workRun: {
      ...workRun,
      evidence: [...workRun.evidence, modelEvidence],
      drafts: latestDraft
        ? [
            ...workRun.drafts.slice(0, -1),
            polishDraft(latestDraft, polish),
          ]
        : workRun.drafts,
      updatedAt: new Date().toISOString(),
    },
    agentRun: {
      ...agentRun,
      model: polish.model ?? agentRun.model,
      steps: [
        ...agentRun.steps,
        {
          id: `step-${crypto.randomUUID().slice(0, 8)}`,
          kind: "draft",
          title: "Local model narrative polish",
          status: "completed",
          summary:
            polish.modelNote ??
            `Polished the structured brief narrative with ${polish.model ?? "Ollama"}.`,
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    },
  };
}
