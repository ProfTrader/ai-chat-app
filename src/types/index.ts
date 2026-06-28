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
  archivedAt?: string;
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

export type NotificationType =
  | "task_assigned"
  | "flow_submitted"
  | "brief_created"
  | "email_drafted"
  | "info";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  projectId?: string;
  taskId?: string;
  actor?: string;
  read: boolean;
  createdAt: string;
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
  archivedAt?: string;
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
  | "score"
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
  sourceMetadata?: {
    kind: "knowledge_pack";
    packId: string;
    label: string;
    sourceName: string;
    sourceUrl: string;
    license?: string;
    notes?: string;
    useCases: string[];
  };
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
export type BriefIntent =
  | "executive_decision"
  | "operational_review"
  | "risk_compliance"
  | "market_intelligence"
  | "performance_snapshot"
  | "action_plan";
export type BriefDesignTemplate =
  | "executive_board"
  | "ops_command"
  | "risk_compliance";

export type AgentDeliveryOutputKind =
  | "conversation"
  | "tool_call"
  | "plan"
  | "artifact"
  | "task_proposal"
  | "gateway_notification";
export type AgentDeliveryStatus = "draft" | "pending" | "running" | "approved" | "completed" | "failed" | "dismissed";
export type ArtifactDeliverableFormat = "html" | "pdf";
export type AgentBrainRunStatus = "queued" | "running" | "needs_approval" | "completed" | "failed";
export type AgentBrainStage =
  | "ingest"
  | "classify"
  | "retrieve_context"
  | "plan"
  | "execute_tools"
  | "observe"
  | "reflect"
  | "deliver"
  | "remember";
export type GatewayChannel = "nexus_chat" | "webhook" | "slack" | "email";
export type MemoryKind = "working" | "project" | "preference" | "evidence";
export type GraduatedTrustLevel = 0 | 1 | 2 | 3;

export interface ArtifactDeliveryStage {
  id: string;
  event: string;
  kind: AgentDeliveryOutputKind;
  label: string;
  detail: string;
  status: "running" | "complete" | "error";
  model?: string;
  provider?: string;
  createdAt: string;
}

export interface PendingArtifactPlan {
  id: string;
  sessionId: string;
  projectId?: string;
  title: string;
  prompt: string;
  markdown: string;
  status: "draft" | "approved" | "completed" | "failed" | "dismissed";
  deliverableFormat: ArtifactDeliverableFormat;
  briefIntent?: BriefIntent;
  designTemplate?: BriefDesignTemplate;
  createdAt: string;
  approvedAt?: string;
  completedAt?: string;
  sourceRunId?: string;
  sourceBrainRunId?: string;
}

export interface AgentDeliveryOutput {
  id: string;
  kind: AgentDeliveryOutputKind;
  status: AgentDeliveryStatus;
  title: string;
  detail?: string;
  sessionId?: string;
  projectId?: string;
  planId?: string;
  runId?: string;
  draftId?: string;
  toolInvocationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentContextPack {
  id: string;
  projectId: string;
  taskCount: number;
  openTaskCount: number;
  datasetCount: number;
  datasetRowCount: number;
  contactCount: number;
  teamCount: number;
  memoryCount: number;
  recentRunCount: number;
  summary: string;
  createdAt: string;
}

export interface AgentBrainRun {
  id: string;
  projectId: string;
  sessionId?: string;
  gatewayMessageId?: string;
  workRunId?: string;
  title: string;
  request: string;
  intent: "conversation" | "brief" | "task_proposal" | "gateway_notification";
  status: AgentBrainRunStatus;
  trustLevel: GraduatedTrustLevel;
  currentStage: AgentBrainStage;
  contextPackId: string;
  outputKind?: AgentDeliveryOutputKind;
  model?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AgentBrainStep {
  id: string;
  runId: string;
  projectId: string;
  stage: AgentBrainStage;
  title: string;
  detail: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

export interface AgentBrainToolCall {
  id: string;
  runId: string;
  projectId: string;
  toolId: string;
  toolName: string;
  risk: "low" | "medium" | "high";
  status: "queued" | "running" | "success" | "failed" | "blocked";
  inputSummary: string;
  outputSummary?: string;
  approvalId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AgentObservation {
  id: string;
  runId: string;
  projectId: string;
  title: string;
  body: string;
  sourceIds: string[];
  createdAt: string;
}

export interface AgentApproval {
  id: string;
  runId: string;
  projectId: string;
  action: string;
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "expired";
  reason: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AgentMemoryItem {
  id: string;
  projectId: string;
  runId?: string;
  kind: MemoryKind;
  title: string;
  body: string;
  confidence: number;
  source: "user" | "agent" | "gateway" | "system";
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionGrant {
  id: string;
  projectId: string;
  toolId: string;
  label: string;
  trustLevel: GraduatedTrustLevel;
  status: "available" | "granted" | "revoked" | "requires_approval";
  risk: "low" | "medium" | "high";
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayMessage {
  id: string;
  projectId: string;
  channel: GatewayChannel;
  externalThreadId?: string;
  sender: string;
  text: string;
  status: "received" | "routed" | "failed";
  runId?: string;
  createdAt: string;
}

export interface AgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  scope: "project" | "workspace" | "gateway";
  risk: "low" | "medium" | "high";
  triggerExamples: string[];
  requiredTools: string[];
}

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

export interface HtmlBriefArtifact {
  id: string;
  fileName: string;
  title: string;
  html: string;
  createdAt: string;
  sourceDraftId: string;
  sourceDraftVersion?: number;
  briefIntent?: BriefIntent;
  designTemplate?: BriefDesignTemplate;
  exportReady?: boolean;
  deliverableFormat?: ArtifactDeliverableFormat;
  deliveryStages?: ArtifactDeliveryStage[];
  visualizationCount: number;
  tableCount: number;
  evidenceCount: number;
}

export interface DraftArtifact {
  id: string;
  version: number;
  style: BriefStyle;
  briefIntent?: BriefIntent;
  designTemplate?: BriefDesignTemplate;
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
  htmlArtifact?: HtmlBriefArtifact;
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
  sourcePlanId?: string;
  approvedPlanMarkdown?: string;
  deliveryStages?: ArtifactDeliveryStage[];
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
