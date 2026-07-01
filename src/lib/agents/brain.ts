import type {
  AgentBrainStage,
  AgentContextPack,
  AgentDomainId,
  AgentSkillDefinition,
  Contact,
  GatewayChannel,
  MemoryKind,
  PermissionGrant,
  ProjectDataset,
  Task,
  TeamMember,
  WorkRun,
  AgentMemoryItem,
} from "@/types";

export const agentBrainStageLabels: Record<AgentBrainStage, string> = {
  ingest: "Ingest request",
  classify: "Classify intent",
  retrieve_context: "Retrieve context",
  plan: "Plan next moves",
  execute_tools: "Execute tools",
  observe: "Observe results",
  reflect: "Reflect",
  deliver: "Deliver output",
  remember: "Remember",
};

export const agentSkillDefinitions: AgentSkillDefinition[] = [
  {
    id: "project_context_retrieval",
    name: "Project context retrieval",
    description: "Builds a compact project context pack from chats, tasks, team, datasets, briefs, and memory.",
    scope: "project",
    risk: "low",
    triggerExamples: ["What is blocking launch?", "Summarize project status"],
    requiredTools: ["inspect_project_context"],
  },
  {
    id: "brief_artifact_delivery",
    name: "Brief artifact delivery",
    description: "Plans, drafts, audits, and exports evidence-backed HTML brief artifacts.",
    scope: "project",
    risk: "medium",
    triggerExamples: ["Create a brief", "Build a board-ready memo"],
    requiredTools: ["inspect_dataset", "create_brief_artifact", "audit_artifact"],
  },
  {
    id: "task_proposal",
    name: "Task proposal",
    description: "Converts findings into review-gated task, board, owner, and due-date proposals.",
    scope: "project",
    risk: "medium",
    triggerExamples: ["Turn this into tasks", "Assign follow-ups"],
    requiredTools: ["propose_work"],
  },
  {
    id: "gateway_triage",
    name: "Gateway triage",
    description: "Routes inbound chat, webhook, Slack, GitHub, or email messages into the right project run.",
    scope: "gateway",
    risk: "low",
    triggerExamples: ["Webhook message received", "Slack thread update"],
    requiredTools: ["route_gateway_message", "inspect_project_context"],
  },
  {
    id: "memory_reflection",
    name: "Memory reflection",
    description: "Captures durable project facts, preferences, and evidence notes from completed runs.",
    scope: "project",
    risk: "low",
    triggerExamples: ["Remember this preference", "Use this next time"],
    requiredTools: ["write_project_memory"],
  },
];

export const defaultPermissionGrants = (projectId: string, now: string): PermissionGrant[] => [
  {
    id: `perm-${projectId}-read-context`,
    projectId,
    toolId: "inspect_project_context",
    label: "Read project context",
    trustLevel: 0,
    status: "granted",
    risk: "low",
    reason: "Required for grounded answers and read-only project analysis.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: `perm-${projectId}-draft-artifacts`,
    projectId,
    toolId: "create_brief_artifact",
    label: "Draft brief artifacts",
    trustLevel: 1,
    status: "requires_approval",
    risk: "medium",
    reason: "Artifact production remains review-gated through the Working Doc approval.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: `perm-${projectId}-propose-work`,
    projectId,
    toolId: "propose_work",
    label: "Propose project work",
    trustLevel: 1,
    status: "requires_approval",
    risk: "medium",
    reason: "The agent may draft tasks and board changes but cannot apply them without review.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: `perm-${projectId}-gateway-notify`,
    projectId,
    toolId: "send_gateway_message",
    label: "Send external gateway messages",
    trustLevel: 3,
    status: "requires_approval",
    risk: "high",
    reason: "External sends always require explicit approval in v1.",
    createdAt: now,
    updatedAt: now,
  },
];

export function classifyAgentIntent(prompt: string): "conversation" | "brief" | "task_proposal" | "gateway_notification" {
  const input = prompt.toLowerCase();
  if (/\b(brief|memo|report|artifact|dossier|pdf|html)\b/.test(input)) return "brief";
  if (/\b(task|todo|assign|owner|board|roadmap|follow[- ]?up)\b/.test(input)) return "task_proposal";
  if (/\b(webhook|slack|github|email|notify|message channel|gateway)\b/.test(input)) return "gateway_notification";
  return "conversation";
}

export function memoryKindForText(text: string): MemoryKind {
  const input = text.toLowerCase();
  if (/\b(prefer|preference|always|tone|style|format)\b/.test(input)) return "preference";
  if (/\b(source|evidence|citation|dataset|proof)\b/.test(input)) return "evidence";
  if (/\b(project|customer|launch|support|team|owner)\b/.test(input)) return "project";
  return "working";
}

export function buildAgentContextPack({
  projectId,
  tasks,
  datasets,
  contacts,
  teamMembers,
  memories,
  workRuns,
}: {
  projectId: string;
  tasks: Task[];
  datasets: ProjectDataset[];
  contacts: Contact[];
  teamMembers: TeamMember[];
  memories: AgentMemoryItem[];
  workRuns: WorkRun[];
}): AgentContextPack {
  const openTaskCount = tasks.filter((task) => task.status !== "done").length;
  const datasetRowCount = datasets.reduce((total, dataset) => total + dataset.rows.length, 0);
  const highPriority = tasks.filter((task) => task.priority === "high").length;
  const summary = [
    `${tasks.length} tasks (${openTaskCount} open, ${highPriority} high priority)`,
    `${datasets.length} datasets (${datasetRowCount.toLocaleString()} rows)`,
    `${contacts.length + teamMembers.length} people`,
    `${memories.length} memories`,
    `${workRuns.length} recent artifacts`,
  ].join(" | ");

  return {
    id: `ctx-${crypto.randomUUID().slice(0, 8)}`,
    projectId,
    taskCount: tasks.length,
    openTaskCount,
    datasetCount: datasets.length,
    datasetRowCount,
    contactCount: contacts.length,
    teamCount: teamMembers.length,
    memoryCount: memories.length,
    recentRunCount: workRuns.length,
    summary,
    createdAt: new Date().toISOString(),
  };
}

export function defaultGatewayChannelLabel(channel: GatewayChannel) {
  if (channel === "nexus_chat") return "Nexus chat";
  if (channel === "webhook") return "Webhook";
  if (channel === "slack") return "Slack";
  if (channel === "github") return "GitHub";
  return "Email";
}

export function domainFromPrompt(prompt: string): AgentDomainId {
  const input = prompt.toLowerCase();
  if (/\b(payout|trader|funded|breach|prop)\b/.test(input)) return "prop_firm";
  if (/\b(revenue|order|commerce|product|discount)\b/.test(input)) return "commerce";
  if (/\b(social|post|engagement|creator)\b/.test(input)) return "social";
  return "general";
}
