export type TaskStatus = "todo" | "in_progress" | "done";

export interface Workspace {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
}

export interface Task {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  status: TaskStatus;
  description?: string;
  assignee?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  sourceRunId?: string;
  sourceDraftId?: string;
  sourceFinding?: string;
  createdAt: string;
  updatedAt: string;
}

export type PresenceStatus = "online" | "away" | "busy" | "offline";

export interface Contact {
  id: string;
  projectId: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  lastActivity: string;
  notes?: string;
  avatarUrl?: string;
  status?: PresenceStatus;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  status?: PresenceStatus;
}

export type AgentDomainId = "general" | "prop_firm" | "commerce" | "social";
export type DatasetSourceKind = "mock" | "csv" | "workspace";
export type DatasetColumnType = "string" | "number" | "date" | "boolean";
export type DatasetSemanticRole =
  | "date"
  | "entity"
  | "account_stage"
  | "account_status"
  | "revenue"
  | "profit"
  | "payout"
  | "sales"
  | "discount"
  | "product"
  | "category"
  | "customer"
  | "channel"
  | "author"
  | "engagement"
  | "status"
  | "priority"
  | "owner";

export interface DatasetColumn {
  key: string;
  label: string;
  type: DatasetColumnType;
  semanticRole?: DatasetSemanticRole;
  missingRate: number;
  sampleValues: string[];
}

export type DatasetRowValue = string | number | boolean | null;

export interface ProjectDataset {
  id: string;
  projectId: string;
  name: string;
  domainId: AgentDomainId;
  sourceKind: DatasetSourceKind;
  columns: DatasetColumn[];
  rows: Array<Record<string, DatasetRowValue>>;
  createdAt: string;
  updatedAt: string;
}

export type AgentRunStatus = "queued" | "running" | "needs_input" | "completed" | "failed";
export type AgentStepKind =
  | "plan"
  | "tool_call"
  | "observation"
  | "analysis"
  | "draft"
  | "audit"
  | "proposal";

export interface AgentToolDefinition {
  id: string;
  name: string;
  description: string;
  risk: "low" | "medium" | "high";
  approvalMode: "none" | "review_before_apply";
  inputSchema: string;
  outputSchema: string;
}

export interface ToolInvocation {
  id: string;
  toolId: string;
  toolName: string;
  status: "success" | "failed";
  inputSummary: string;
  outputSummary: string;
  evidenceIds: string[];
  durationMs: number;
  error?: string;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  kind: AgentStepKind;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  summary: string;
  toolInvocationId?: string;
  createdAt: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  sourceColumnKeys: string[];
  unit: "count" | "currency" | "percent" | "ratio" | "score";
  grain: "row" | "day" | "week" | "month" | "segment";
}

export interface Insight {
  id: string;
  claim: string;
  evidenceIds: string[];
  confidence: number;
  recommendedAction: string;
  assumption?: boolean;
}

export interface AgentMemoryNote {
  id: string;
  projectId: string;
  runId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  workRunId?: string;
  request: string;
  status: AgentRunStatus;
  domainId: AgentDomainId;
  model?: string;
  datasetIds: string[];
  steps: AgentStep[];
  toolInvocations: ToolInvocation[];
  metrics: MetricDefinition[];
  insights: Insight[];
  memoryNotes: AgentMemoryNote[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  workspace: string;
  bio?: string;
  avatarUrl: string;
  status: PresenceStatus;
}

export type ViewType =
  | "chat"
  | "briefs"
  | "tasks"
  | "contacts"
  | "board"
  | "timeline"
  | "nodes";

export interface ContextChip {
  id: string;
  label: string;
  type: "task" | "contact" | "project" | "file";
}

export type ComposerMode = "plan" | "auto";

export type WorkLoopPhase =
  | "plan"
  | "iterate"
  | "inspect"
  | "create"
  | "audit"
  | "complete";

export interface PlanArtifact {
  id: string;
  objective: string;
  audience: string;
  questions: string[];
  assumptions: string[];
  sources: string[];
  milestones: string[];
  successCriteria: string[];
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceKind = "workspace" | "file" | "web" | "database";

export interface EvidenceSource {
  id: string;
  kind: EvidenceKind;
  title: string;
  source: string;
  excerpt: string;
  confidence: number;
  linkedClaimIds: string[];
  toolInvocationId?: string;
  missing?: boolean;
}

export type VisualizationKind = "kpi" | "table" | "bar" | "line" | "comparison" | "timeline";
export type BriefStyle = "research_memo" | "ops_report" | "market_dossier";

export interface DraftSection {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}

export interface VisualizationBlock {
  id: string;
  kind: VisualizationKind;
  title: string;
  insight: string;
  data: Array<Record<string, string | number>>;
}

export interface ArtifactTable {
  id: string;
  title: string;
  caption: string;
  columns: Array<{
    key: string;
    label: string;
    align?: "left" | "right";
  }>;
  rows: Array<Record<string, string | number>>;
  sourceIds: string[];
}

export interface ArtifactChart {
  id: string;
  type: Exclude<VisualizationKind, "table">;
  title: string;
  insight: string;
  xField: string;
  yField: string;
  seriesField?: string;
  data: Array<Record<string, string | number>>;
  sourceIds: string[];
}

export interface ArtifactClaim {
  id: string;
  claim: string;
  confidence: number;
  citationIds: string[];
  assumption?: boolean;
}

export type ArtifactBlock =
  | {
      id: string;
      type: "hero";
      eyebrow: string;
      title: string;
      subtitle: string;
      meta: Array<{ label: string; value: string }>;
    }
  | {
      id: string;
      type: "summary";
      title: string;
      body: string;
      takeaways: string[];
    }
  | {
      id: string;
      type: "kpi_grid";
      title: string;
      insight: string;
      items: Array<{ label: string; value: string | number; detail?: string }>;
      sourceIds: string[];
    }
  | {
      id: string;
      type: "chart";
      chart: ArtifactChart;
    }
  | {
      id: string;
      type: "table";
      table: ArtifactTable;
    }
  | {
      id: string;
      type: "finding";
      title: string;
      claims: ArtifactClaim[];
    }
  | {
      id: string;
      type: "recommendation";
      title: string;
      recommendations: Array<{
        priority: "high" | "medium" | "low";
        action: string;
        expectedImpact: string;
        sourceIds: string[];
      }>;
    }
  | {
      id: string;
      type: "evidence";
      title: string;
      sourceIds: string[];
    }
  | {
      id: string;
      type: "audit";
      title: string;
      checklistIds: string[];
    }
  | {
      id: string;
      type: "task_proposal";
      title: string;
      body: string;
    };

export interface ArtifactSection {
  id: string;
  title: string;
  purpose: string;
  blocks: ArtifactBlock[];
}

export interface DraftArtifact {
  id: string;
  version: number;
  style: BriefStyle;
  title: string;
  summary: string;
  thesis: string;
  sections: DraftSection[];
  citations: Array<{
    label: string;
    sourceId: string;
  }>;
  findings: string[];
  recommendations: string[];
  visualizations: VisualizationBlock[];
  artifactSections?: ArtifactSection[];
  createdAt: string;
}

export interface AuditResult {
  id: string;
  score: number;
  publishReady: boolean;
  checklist: Array<{
    id: string;
    label: string;
    score: number;
    status: "pass" | "warn" | "fail";
  }>;
  failedChecks: string[];
  requiredFixes: string[];
  stopReason?: string;
  createdAt: string;
}

export interface WorkRun {
  id: string;
  projectId: string;
  agentRunId?: string;
  domainId?: AgentDomainId;
  datasetIds?: string[];
  title: string;
  request: string;
  phase: WorkLoopPhase;
  status: "draft" | "running" | "blocked" | "ready" | "published";
  plan: PlanArtifact;
  evidence: EvidenceSource[];
  drafts: DraftArtifact[];
  audit: AuditResult;
  iteration: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProposedTask {
  id: string;
  title: string;
  description: string;
  suggestedAssignee?: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  sourceRunId: string;
  sourceDraftId: string;
  sourceFinding: string;
  reason: string;
  unresolvedOwner?: boolean;
}

export interface AgentActionProposal {
  id: string;
  projectId: string;
  runId: string;
  draftId: string;
  status: "draft" | "needs_review" | "approved" | "applied" | "rejected";
  proposedTasks: ProposedTask[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivity {
  id: string;
  projectId: string;
  taskId?: string;
  runId?: string;
  type:
    | "task_created"
    | "status_changed"
    | "assignee_changed"
    | "priority_changed"
    | "brief_task_applied"
    | "roadmap_item_linked";
  title: string;
  description: string;
  actor: "Agent" | "User" | "System";
  createdAt: string;
}

export interface RoadmapItem {
  id: string;
  projectId: string;
  runId?: string;
  title: string;
  description: string;
  horizon: "short_term" | "long_term";
  status: "planned" | "active" | "done";
  owner?: string;
  linkedTaskIds: string[];
  createdAt: string;
}
