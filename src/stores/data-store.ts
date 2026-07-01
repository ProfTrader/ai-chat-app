import { create } from "zustand";
import type {
  AgentActionProposal,
  AgentApproval,
  AgentBrainRun,
  AgentBrainRunStatus,
  AgentBrainStage,
  AgentBrainStep,
  AgentBrainToolCall,
  AgentContextPack,
  AgentDeliveryOutput,
  AgentDeliveryOutputKind,
  AgentDomainId,
  AgentMemoryItem,
  AgentMemoryNote,
  AgentObservation,
  AgentRun,
  AppNotification,
  ArtifactDeliveryStage,
  Contact,
  DatasetSemanticRole,
  GatewayChannel,
  GatewayMessage,
  GraduatedTrustLevel,
  MemoryKind,
  Message,
  PendingArtifactPlan,
  PermissionGrant,
  Project,
  ProjectDataset,
  RoleCapability,
  ResearchDoc,
  RoadmapItem,
  Session,
  Task,
  TaskActivity,
  TaskStatus,
  TeamRole,
  WorkspaceEvent,
  WorkspaceFile,
  WorkspaceFileKind,
  WorkspaceMember,
  TeamMember,
  TeamMessage,
  WorkLoopPhase,
  WorkRun,
  Workspace,
} from "@/types";
import { currentUser } from "@/lib/current-user";
import { unsplashAvatars } from "@/lib/avatars";
import {
  normalizePlanTier,
  type PlanDraft,
  type PlanRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type PlanStatus,
} from "@/lib/plan/client";
import type { InsightDraft, InsightRecord } from "@/lib/insight/client";
import {
  buildPromotedHead,
  headVersionLabel,
  summarizePromotion,
  type HeadVersion,
  type PromotionSummary,
  type Worktree,
} from "@/lib/worktree/client";
import {
  canRolePerform,
  canonicalTasksForProject,
  effectiveRoleForUser,
  normalizeWorktree,
  stagedTasksForWorktree,
} from "@/lib/workspace/harness";
import {
  deriveAutomationFields,
  deriveCadence,
  deriveStartDate,
  formatScheduleDate,
  type AutomationRule,
  type AutomationStatus,
  type ScheduleEntry,
} from "@/lib/automation/client";
import {
  approvePlan,
  auditWorkRun,
  createAgentActionProposal,
  createNextDraft,
  createRoadmapItemsFromRun,
  nextLoopPhase,
  updateRunPhase,
} from "@/lib/artifacts/brief-loop";
import {
  createDatasetFromCsv,
  createSampleDataset,
  runBusinessIntelligenceAgent,
} from "@/lib/agents/runtime";
import {
  createKnowledgePackDataset,
  type KnowledgePackId,
} from "@/lib/agents/knowledge-packs";
import {
  isBrowserDatabaseAvailable,
  loadBrowserData,
  saveBrowserData,
} from "@/lib/browser-db";
import { tradeifyResearchDocs } from "@/lib/research/tradeify-seed";
import {
  applyLocalModelBrief,
  generateBriefWithLocalModel,
  streamBriefWithLocalModel,
  type ArtifactStreamEvent,
} from "@/lib/agents/client";
import { enrichContacts, enrichTeamMember } from "@/lib/person-profiles";
import {
  buildAgentContextPack,
  classifyAgentIntent,
  defaultGatewayChannelLabel,
  defaultPermissionGrants,
  domainFromPrompt,
  memoryKindForText,
} from "@/lib/agents/brain";

type StorageBackend = "sqlite" | "indexeddb" | "localstorage" | "memory";

interface DataState {
  artifactSchemaVersion: number;
  initialized: boolean;
  storageBackend: StorageBackend;
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  projects: Project[];
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
  researchDocs: ResearchDoc[];
  teamMembers: TeamMember[];
  teamMessages: TeamMessage[];
  datasets: ProjectDataset[];
  agentRuns: AgentRun[];
  agentMemoryNotes: AgentMemoryNote[];
  agentBrainRuns: AgentBrainRun[];
  agentBrainSteps: AgentBrainStep[];
  agentBrainToolCalls: AgentBrainToolCall[];
  agentObservations: AgentObservation[];
  agentApprovals: AgentApproval[];
  agentContextPacks: AgentContextPack[];
  agentMemories: AgentMemoryItem[];
  permissionGrants: PermissionGrant[];
  gatewayMessages: GatewayMessage[];
  workRuns: WorkRun[];
  pendingArtifactPlans: PendingArtifactPlan[];
  deliveryOutputs: AgentDeliveryOutput[];
  actionProposals: AgentActionProposal[];
  taskActivities: TaskActivity[];
  roadmapItems: RoadmapItem[];
  plans: PlanRecord[];
  insights: InsightRecord[];
  worktrees: Worktree[];
  headVersions: HeadVersion[];
  /**
   * Per-team "active" HEAD pointer for rollback. Absent ⇒ readers follow the
   * latest version; set ⇒ downstream reads (canonical files/datasets) pin to
   * that older version until the team resumes latest or promotes again.
   */
  activeHeadVersionByTeam: Record<string, number>;
  automations: AutomationRule[];
  scheduleEntries: ScheduleEntry[];
  workspaceFiles: WorkspaceFile[];
  workspaceEvents: WorkspaceEvent[];
  selectedWorkRunId: string | null;
  initialize: () => Promise<void>;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "identifier">) => Promise<Task>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  addMessage: (sessionId: string, content: string, role?: Message["role"]) => Promise<Message>;
  persistChatMessage: (
    sessionId: string,
    content: string,
    role?: Message["role"],
    id?: string,
  ) => Promise<Message>;
  updateMessageContent: (id: string, content: string) => Promise<void>;
  /**
   * Toggle an emoji reaction on a message. Returns the resulting reaction list
   * and whether the emoji was added (true) or removed (false).
   */
  toggleMessageReaction: (
    id: string,
    emoji: string,
  ) => { reactions: string[]; added: boolean };
  getTeamMessagesByProject: (projectId: string) => TeamMessage[];
  /**
   * Post a message to a project's team chat. Each @mentioned teammate gets a
   * notification so the call-out is reflected in the inbox.
   */
  postTeamMessage: (input: {
    projectId: string;
    body: string;
    mentions: string[];
  }) => TeamMessage;
  addSession: (projectId: string, title?: string) => Promise<Session>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  moveSession: (sessionId: string, projectId: string) => void;
  createPlan: (input: {
    projectId?: string;
    sessionId?: string;
    draft: PlanDraft;
  }) => PlanRecord;
  updatePlan: (
    id: string,
    patch: Partial<Pick<PlanRecord, "title" | "summary" | "steps" | "assumptions">>,
  ) => void;
  setPlanStatus: (id: string, status: PlanStatus) => void;
  /** Approve a plan: turn its steps into board tasks and mark it approved. */
  buildPlanTasks: (id: string) => Task[];
  getPlan: (id: string) => PlanRecord | undefined;
  /** Persist a computed executive-insight record and return it. */
  createInsight: (draft: InsightDraft) => InsightRecord;
  getInsight: (id: string) => InsightRecord | undefined;
  /**
   * Guarantee the project has a finance-shaped dataset for insights: return an
   * existing one (revenue/sales role) or seed the real supermarket dataset.
   */
  ensureInsightDataset: (projectId: string) => Promise<ProjectDataset>;

  // --- Worktrees + HEAD (git-style data delivery) --------------------------
  /** Create a user-owned staging branch for a team. */
  createWorktree: (teamId: string, name: string) => Worktree;
  getWorktree: (id: string) => Worktree | undefined;
  getWorktreesByTeam: (teamId: string) => Worktree[];
  /** Import a CSV into a worktree (isolated from HEAD until promoted). */
  importToWorktree: (
    worktreeId: string,
    name: string,
    domainId: AgentDomainId,
    text: string,
  ) => ProjectDataset | null;
  /** Stage a sample dataset into a worktree (for quick testing). */
  addSampleToWorktree: (worktreeId: string, domainId: AgentDomainId) => ProjectDataset | null;
  /** Datasets staged in a worktree. */
  getWorktreeDatasets: (worktreeId: string) => ProjectDataset[];
  /** Latest HEAD version for a team (undefined if none yet). */
  getHeadVersion: (teamId: string) => HeadVersion | undefined;
  /** HEAD version history for a team, newest first. */
  getHeadVersions: (teamId: string) => HeadVersion[];
  /** Datasets composing the team's active HEAD (pinned version, else latest). */
  getHeadDatasets: (teamId: string) => ProjectDataset[];
  /** The active HEAD for readers: the pinned rollback version, else latest. */
  getActiveHeadVersion: (teamId: string) => HeadVersion | undefined;
  /** Pin an older HEAD version as active (rollback). No-op without approve rights. */
  pinHeadVersion: (teamId: string, version: number) => void;
  /** Clear the rollback pin so readers follow the latest HEAD again. */
  resumeLatestHead: (teamId: string) => void;
  /** Pure pre-promotion diff for a worktree (net-new/appended datasets, counts). */
  summarizePromotionForWorktree: (worktreeId: string) => PromotionSummary | null;
  /** Initialise HEAD v1 from a team's existing (non-worktree) datasets. */
  ensureHead: (teamId: string) => HeadVersion | undefined;
  /** Move a worktree into review (the CD approval gate). */
  requestWorktreePromotion: (worktreeId: string, note?: string) => Worktree | null;
  /** Approve + merge a worktree into a new immutable HEAD version. */
  promoteWorktree: (worktreeId: string) => HeadVersion | null;
  approveWorktreePromotion: (worktreeId: string) => HeadVersion | null;
  rejectWorktreePromotion: (worktreeId: string, reason?: string) => Worktree | null;
  discardWorktree: (worktreeId: string) => void;
  /** Role/capability helpers used by UI and store guards. */
  getEffectiveRole: (workspaceId?: string) => TeamRole;
  canPerform: (workspaceId: string | undefined, capability: RoleCapability) => boolean;
  /** Stage local-first files and tasks into a branch before review. */
  stageFileToWorktree: (
    worktreeId: string,
    input: {
      name: string;
      kind: WorkspaceFileKind;
      content?: string;
      sourceUrl?: string;
      domainId?: AgentDomainId;
    },
  ) => WorkspaceFile | null;
  stageTaskToWorktree: (
    worktreeId: string,
    input: Pick<Task, "title" | "description" | "priority" | "dueDate" | "assignee">,
  ) => Task | null;
  getWorkspaceFilesByProject: (projectId: string) => WorkspaceFile[];
  getCanonicalFilesByProject: (projectId: string) => WorkspaceFile[];
  getFilesByWorktree: (worktreeId: string) => WorkspaceFile[];
  recordWorkspaceEvent: (
    event: Omit<WorkspaceEvent, "id" | "createdAt" | "actorId" | "actorName"> &
      Partial<Pick<WorkspaceEvent, "actorId" | "actorName" | "createdAt">>,
  ) => WorkspaceEvent;
  getWorkspaceEventsByProject: (projectId: string) => WorkspaceEvent[];
  getEventsByWorktree: (worktreeId: string) => WorkspaceEvent[];

  /** Derive one automation rule per plan step (idempotent per plan). */
  automatePlan: (id: string) => AutomationRule[];
  /** Lay the plan's steps onto a schedule and stamp due dates on tasks. */
  schedulePlan: (id: string) => ScheduleEntry[];
  setAutomationStatus: (id: string, status: AutomationStatus) => void;
  getAutomationsByPlan: (planId: string) => AutomationRule[];
  getScheduleByPlan: (planId: string) => ScheduleEntry[];
  archiveSession: (sessionId: string) => void;
  addProject: (name: string, workspaceId: string) => Promise<Project>;
  applyFirmName: (name: string) => void;
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  archiveProject: (projectId: string) => void;
  importCsvDataset: (
    projectId: string,
    name: string,
    domainId: AgentDomainId,
    text: string,
  ) => ProjectDataset;
  addSampleDataset: (projectId: string, domainId: AgentDomainId) => ProjectDataset;
  addKnowledgePackDataset: (
    projectId: string,
    packId: KnowledgePackId,
  ) => ProjectDataset;
  updateDatasetColumnRole: (
    datasetId: string,
    columnKey: string,
    semanticRole?: DatasetSemanticRole,
  ) => void;
  startAgentBrainRun: (input: {
    projectId: string;
    sessionId?: string;
    request: string;
    title?: string;
    gatewayMessageId?: string;
    intent?: AgentBrainRun["intent"];
    outputKind?: AgentDeliveryOutputKind;
    model?: string;
  }) => AgentBrainRun;
  advanceAgentBrainRun: (
    runId: string,
    stage: AgentBrainStage,
    title: string,
    detail: string,
  ) => AgentBrainStep | null;
  completeAgentBrainRun: (
    runId: string,
    status?: AgentBrainRunStatus,
    error?: string,
  ) => void;
  recordAgentObservation: (
    runId: string,
    title: string,
    body: string,
    sourceIds?: string[],
  ) => AgentObservation | null;
  recordAgentMemory: (input: {
    projectId: string;
    runId?: string;
    title: string;
    body: string;
    kind?: MemoryKind;
    source?: AgentMemoryItem["source"];
    confidence?: number;
    pinned?: boolean;
  }) => AgentMemoryItem;
  updateAgentMemory: (
    id: string,
    patch: Partial<Pick<AgentMemoryItem, "title" | "body" | "kind" | "pinned" | "confidence">>,
  ) => void;
  deleteAgentMemory: (id: string) => void;
  upsertPermissionGrant: (grant: PermissionGrant) => PermissionGrant;
  updatePermissionGrant: (
    id: string,
    status: PermissionGrant["status"],
    trustLevel?: GraduatedTrustLevel,
  ) => void;
  createGatewayMessage: (input: {
    projectId: string;
    channel: GatewayChannel;
    sender: string;
    text: string;
    externalThreadId?: string;
    externalId?: string;
    externalUrl?: string;
    eventType?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }) => GatewayMessage;
  routeGatewayMessage: (messageId: string, runId: string) => void;
  createWorkRunFromPrompt: (prompt: string, projectId?: string) => Promise<WorkRun>;
  createArtifactRunFromPromptStream: (
    prompt: string,
    projectId?: string,
    onEvent?: (event: ArtifactStreamEvent) => void,
  ) => Promise<WorkRun>;
  commitArtifactRun: (payload: {
    workRun: WorkRun;
    agentRun: AgentRun;
    memoryNotes: AgentMemoryNote[];
  }) => WorkRun;
  upsertPendingArtifactPlan: (plan: PendingArtifactPlan) => PendingArtifactPlan;
  approvePendingArtifactPlan: (id: string) => PendingArtifactPlan | null;
  completePendingArtifactPlan: (id: string, runId: string) => void;
  failPendingArtifactPlan: (id: string) => void;
  dismissPendingArtifactPlan: (id: string) => void;
  selectWorkRun: (id: string | null) => void;
  setWorkRunPhase: (id: string, phase: WorkLoopPhase) => void;
  advanceWorkRun: (id: string) => void;
  approveWorkRunPlan: (id: string) => void;
  createDraftForRun: (id: string) => void;
  rerunWorkRunAudit: (id: string) => void;
  createActionProposalForRun: (runId: string) => AgentActionProposal | null;
  approveActionProposal: (proposalId: string) => void;
  rejectActionProposal: (proposalId: string) => void;
  applyActionProposal: (proposalId: string) => void;
  getTasksByProject: (projectId: string) => Task[];
  getContactsByProject: (projectId: string) => Contact[];
  getTeamMembersByProject: (projectId: string) => TeamMember[];
  /** All teammates across a workspace's projects — the @mention pool. */
  getTeamMembersByWorkspace: (workspaceId: string) => TeamMember[];
  getDatasetsByProject: (projectId: string) => ProjectDataset[];
  getMessagesBySession: (sessionId: string) => Message[];
  getBrainRunsByProject: (projectId: string) => AgentBrainRun[];
  getAgentMemoriesByProject: (projectId: string) => AgentMemoryItem[];
  getPermissionGrantsByProject: (projectId: string) => PermissionGrant[];
  getGatewayMessagesByProject: (projectId: string) => GatewayMessage[];
}

type PersistedDataPayload = {
  artifactSchemaVersion?: number;
  workspaces?: Workspace[];
  workspaceMembers?: WorkspaceMember[];
  projects?: Project[];
  tasks?: Task[];
  contacts?: Contact[];
  sessions?: Session[];
  messages?: Message[];
  researchDocs?: ResearchDoc[];
  teamMembers?: TeamMember[];
  teamMessages?: TeamMessage[];
  datasets?: ProjectDataset[];
  agentRuns?: AgentRun[];
  agentMemoryNotes?: AgentMemoryNote[];
  agentBrainRuns?: AgentBrainRun[];
  agentBrainSteps?: AgentBrainStep[];
  agentBrainToolCalls?: AgentBrainToolCall[];
  agentObservations?: AgentObservation[];
  agentApprovals?: AgentApproval[];
  agentContextPacks?: AgentContextPack[];
  agentMemories?: AgentMemoryItem[];
  permissionGrants?: PermissionGrant[];
  gatewayMessages?: GatewayMessage[];
  workRuns?: WorkRun[];
  pendingArtifactPlans?: PendingArtifactPlan[];
  deliveryOutputs?: AgentDeliveryOutput[];
  actionProposals?: AgentActionProposal[];
  taskActivities?: TaskActivity[];
  roadmapItems?: RoadmapItem[];
  plans?: PlanRecord[];
  insights?: InsightRecord[];
  worktrees?: Worktree[];
  headVersions?: HeadVersion[];
  activeHeadVersionByTeam?: Record<string, number>;
  automations?: AutomationRule[];
  scheduleEntries?: ScheduleEntry[];
  workspaceFiles?: WorkspaceFile[];
  workspaceEvents?: WorkspaceEvent[];
  notifications?: AppNotification[];
  selectedWorkRunId?: string | null;
};

type RunDataSnapshot = Pick<
  DataState,
  "projects" | "tasks" | "contacts" | "sessions" | "messages"
>;

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function generateIdentifier(projectId: string, tasks: Task[]) {
  const prefix =
    projectId === "proj-1" ? "Q2" : projectId === "proj-2" ? "ENT" : "PRJ";
  const count = tasks.filter((t) => t.projectId === projectId).length + 1;
  return `${prefix}-${count}`;
}

async function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function buildRunContext(projectId: string, state: RunDataSnapshot) {
  const project = state.projects.find((item) => item.id === projectId);
  const sessions = state.sessions.filter((session) => session.projectId === projectId);
  const sessionIds = new Set(sessions.map((session) => session.id));

  return {
    project,
    tasks: canonicalTasksForProject(state.tasks, projectId),
    contacts: state.contacts.filter((contact) => contact.projectId === projectId),
    sessions,
    messages: state.messages.filter((message) => sessionIds.has(message.sessionId)),
  };
}

function workspaceIdForProject(projectId: string | undefined, state: Pick<DataState, "projects" | "workspaces">) {
  if (!projectId) return state.workspaces[0]?.id ?? "ws-1";
  return state.projects.find((project) => project.id === projectId)?.workspaceId ?? state.workspaces[0]?.id ?? "ws-1";
}

function hasCurrentRunShape(run: WorkRun) {
  return run.drafts.every((draft) => draft.style && draft.thesis && Array.isArray(draft.sections));
}

function hasDatasetShape(dataset: ProjectDataset) {
  return Boolean(dataset.id && Array.isArray(dataset.columns) && Array.isArray(dataset.rows));
}

function hasPendingPlanShape(plan: PendingArtifactPlan) {
  return Boolean(plan.id && plan.sessionId && plan.prompt && plan.markdown && plan.status);
}

function hasDeliveryOutputShape(output: AgentDeliveryOutput) {
  return Boolean(output.id && output.kind && output.status && output.title);
}

function hasBrainRunShape(run: AgentBrainRun) {
  return Boolean(run.id && run.projectId && run.status && run.currentStage && run.contextPackId);
}

function hasPermissionGrantShape(grant: PermissionGrant) {
  return Boolean(grant.id && grant.projectId && grant.toolId && grant.status);
}

function ensurePermissionGrants(
  projects: Project[],
  grants: PermissionGrant[] = [],
) {
  const now = new Date().toISOString();
  const byId = new Map(grants.filter(hasPermissionGrantShape).map((grant) => [grant.id, grant]));

  projects.forEach((project) => {
    defaultPermissionGrants(project.id, now).forEach((grant) => {
      if (!byId.has(grant.id)) {
        byId.set(grant.id, grant);
      }
    });
  });

  return Array.from(byId.values());
}

function stageFromEvent(event: ArtifactStreamEvent, status: ArtifactDeliveryStage["status"] = "complete"): ArtifactDeliveryStage {
  return {
    id: generateId("stage"),
    event: event.event,
    kind: event.event.includes("tool") ? "tool_call" : "artifact",
    label: event.data.label ?? event.event.replace(/_/g, " "),
    detail: event.data.detail ?? "",
    status: event.event === "artifact_error" ? "error" : status,
    model: event.data.model,
    provider: event.data.provider,
    createdAt: event.at,
  };
}

function attachDeliveryStagesToLatestDraft({
  workRun,
  stages,
}: {
  workRun: WorkRun;
  stages: ArtifactDeliveryStage[];
}): WorkRun {
  const latestDraft = workRun.drafts[workRun.drafts.length - 1];
  if (!latestDraft?.htmlArtifact) {
    return { ...workRun, deliveryStages: stages };
  }

  return {
    ...workRun,
    deliveryStages: stages,
    drafts: [
      ...workRun.drafts.slice(0, -1),
      {
        ...latestDraft,
        htmlArtifact: {
          ...latestDraft.htmlArtifact,
          deliveryStages: stages,
          exportReady: true,
        },
      },
    ],
  };
}

const seedTaskActivityItems: TaskActivity[] = [];
const seedRoadmapItems: RoadmapItem[] = [];
const ARTIFACT_SCHEMA_VERSION = 9;

/** Predefined team workspaces — a ready-made template, not mock data. */
const SEED_PROJECT_CREATED_AT = "2026-01-06T09:00:00.000Z";
const TEAM_PROJECTS: Project[] = [
  { id: "proj-risk", workspaceId: "ws-1", name: "Risk Team", slug: "risk", createdAt: SEED_PROJECT_CREATED_AT, createdBy: currentUser.id },
  { id: "proj-marketing", workspaceId: "ws-1", name: "Marketing Team", slug: "marketing", createdAt: SEED_PROJECT_CREATED_AT, createdBy: currentUser.id },
  { id: "proj-operations", workspaceId: "ws-1", name: "Operations Team", slug: "operations", createdAt: SEED_PROJECT_CREATED_AT, createdBy: currentUser.id },
  { id: "proj-sales", workspaceId: "ws-1", name: "Sales Team", slug: "sales", createdAt: SEED_PROJECT_CREATED_AT, createdBy: currentUser.id },
  { id: "proj-product", workspaceId: "ws-1", name: "Product Team", slug: "product", createdAt: SEED_PROJECT_CREATED_AT, createdBy: currentUser.id },
];

/** Firm name from the persisted onboarding store, so a fresh workspace is named after the firm. */
function readFirmName(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("crm-onboarding");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { state?: { answers?: { businessName?: string } } };
    const name = parsed?.state?.answers?.businessName;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** A clean, mock-free starting workspace (named after the firm when available). */
function defaultWorkspaces(): Workspace[] {
  return [{ id: "ws-1", name: readFirmName() ?? "My Workspace" }];
}

// A default roster so the team chat @mention picker has real people to call,
// like a Slack workspace. Two teammates per team project; deduped by id when
// merged so existing data is never overwritten.
const SEED_TEAMMATES: TeamMember[] = [
  { id: "tm-risk-1", projectId: "proj-risk", name: "Morgan Lee", role: "Risk Analyst", email: "morgan@acme.co", avatarUrl: unsplashAvatars.morgan, status: "online" },
  { id: "tm-risk-2", projectId: "proj-risk", name: "Priya Sharma", role: "Compliance Lead", email: "priya@acme.co", avatarUrl: unsplashAvatars.priya, status: "away" },
  { id: "tm-marketing-1", projectId: "proj-marketing", name: "Jordan Blake", role: "Growth Marketer", email: "jordan@acme.co", avatarUrl: unsplashAvatars.jordan, status: "online" },
  { id: "tm-marketing-2", projectId: "proj-marketing", name: "Emma Stone", role: "Content Lead", email: "emma@acme.co", avatarUrl: unsplashAvatars.emma, status: "online" },
  { id: "tm-operations-1", projectId: "proj-operations", name: "Alex Chen", role: "Operations Manager", email: "alex@acme.co", avatarUrl: unsplashAvatars.alex, status: "busy" },
  { id: "tm-operations-2", projectId: "proj-operations", name: "Sarah Park", role: "Support Lead", email: "sarah@acme.co", avatarUrl: unsplashAvatars.sarah, status: "online" },
  { id: "tm-sales-1", projectId: "proj-sales", name: "Chris Taylor", role: "Account Executive", email: "chris@acme.co", avatarUrl: unsplashAvatars.chris, status: "online" },
  { id: "tm-sales-2", projectId: "proj-sales", name: "Elena Vasquez", role: "Sales Lead", email: "elena@acme.co", avatarUrl: unsplashAvatars.elena, status: "away" },
  { id: "tm-product-1", projectId: "proj-product", name: "Riley Quinn", role: "Product Manager", email: "riley@acme.co", status: "online" },
  { id: "tm-product-2", projectId: "proj-product", name: "Noah Bennett", role: "Product Designer", email: "noah@acme.co", status: "away" },
];

/** Add any seed teammates that are not already present (by id). Non-destructive. */
function mergeSeedTeammates(stored: TeamMember[]): TeamMember[] {
  const ids = new Set(stored.map((member) => member.id));
  return [...stored, ...SEED_TEAMMATES.filter((member) => !ids.has(member.id))];
}

function roleForSeedMember(member: TeamMember): TeamRole {
  const title = member.role.toLowerCase();
  if (title.includes("lead") || title.includes("manager")) return "lead";
  return "member";
}

function defaultWorkspaceMembers(workspaces: Workspace[]): WorkspaceMember[] {
  const now = SEED_PROJECT_CREATED_AT;
  const workspaceId = workspaces[0]?.id ?? "ws-1";
  const byEmail = new Map<string, WorkspaceMember>();
  byEmail.set(currentUser.email.toLowerCase(), {
    id: "wm-current-user",
    workspaceId,
    userId: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: "owner",
    avatarUrl: currentUser.avatarUrl,
    status: currentUser.status,
    createdAt: now,
    updatedAt: now,
  });
  SEED_TEAMMATES.forEach((member) => {
    const email = member.email.toLowerCase();
    if (byEmail.has(email)) return;
    byEmail.set(email, {
      id: `wm-${member.id}`,
      workspaceId,
      userId: member.id,
      name: member.name,
      email: member.email,
      role: roleForSeedMember(member),
      avatarUrl: member.avatarUrl,
      status: member.status,
      createdAt: now,
      updatedAt: now,
    });
  });
  return Array.from(byEmail.values());
}

function normalizeWorkspaceMembers(
  workspaces: Workspace[],
  stored: WorkspaceMember[] = [],
): WorkspaceMember[] {
  const now = new Date().toISOString();
  const fallback = defaultWorkspaceMembers(workspaces);
  const byId = new Map<string, WorkspaceMember>();
  stored.forEach((member) => {
    if (!member.id || !member.workspaceId || !member.userId || !member.email) return;
    byId.set(member.id, {
      ...member,
      role: member.role ?? "member",
      createdAt: member.createdAt ?? now,
      updatedAt: member.updatedAt ?? now,
    });
  });
  fallback.forEach((member) => {
    if (!byId.has(member.id)) byId.set(member.id, member);
  });
  return Array.from(byId.values());
}

function defaultProjects(): Project[] {
  return TEAM_PROJECTS.map((project) => ({ ...project }));
}

/**
 * Re-home research docs whose projectId no longer matches a real project. Early
 * seeds tagged the Tradeify corpus with a stale "proj-1" id that doesn't exist
 * in the current TEAM_PROJECTS, which made the per-project research filter in
 * the chat agent drop every doc. Orphaned docs are reassigned to the Risk Team
 * (the corpus's intended home), falling back to the first available project.
 */
function normalizeResearchProjects(
  docs: ResearchDoc[],
  validProjectIds: Set<string>,
): ResearchDoc[] {
  const home = validProjectIds.has("proj-risk")
    ? "proj-risk"
    : validProjectIds.values().next().value;
  if (!home) return docs;
  return docs.map((doc) =>
    validProjectIds.has(doc.projectId) ? doc : { ...doc, projectId: home },
  );
}

function hydratePersistedData(
  data: PersistedDataPayload,
  storageBackend: StorageBackend,
): Partial<DataState> {
  const storedRuns =
    Array.isArray(data.workRuns) && data.workRuns.every(hasCurrentRunShape)
      ? data.workRuns
      : [];
  const pendingArtifactPlans =
    Array.isArray(data.pendingArtifactPlans) &&
    data.pendingArtifactPlans.every(hasPendingPlanShape)
      ? data.pendingArtifactPlans
      : [];
  const deliveryOutputs =
    Array.isArray(data.deliveryOutputs) &&
    data.deliveryOutputs.every(hasDeliveryOutputShape)
      ? data.deliveryOutputs
      : [];
  // Schema < 7 carried mock CRM data — wipe it. From schema 7+ we PRESERVE the
  // user's real projects and chat history, and just make sure the predefined
  // team-project template exists alongside them (non-destructive).
  const resetMock = (data.artifactSchemaVersion ?? 0) < 7;
  const projects = resetMock
    ? defaultProjects()
    : (() => {
        const seedById = new Map(TEAM_PROJECTS.map((team) => [team.id, team]));
        // Backfill creator metadata that predates the createdAt/createdBy fields.
        const stored = (data.projects ?? []).map((project) => {
          const seed = seedById.get(project.id);
          return {
            ...project,
            createdAt: project.createdAt ?? seed?.createdAt,
            createdBy: project.createdBy ?? seed?.createdBy ?? currentUser.id,
          };
        });
        const ids = new Set(stored.map((project) => project.id));
        const merged = [...stored, ...TEAM_PROJECTS.filter((team) => !ids.has(team.id))];
        return merged.length > 0 ? merged : defaultProjects();
      })();
  const workspaces = resetMock ? defaultWorkspaces() : data.workspaces ?? defaultWorkspaces();
  const shouldDropSeededChatHistory = (data.artifactSchemaVersion ?? 0) < 6;
  const validProjectIds = new Set(projects.map((project) => project.id));
  const storedBrainRuns =
    Array.isArray(data.agentBrainRuns) && data.agentBrainRuns.every(hasBrainRunShape)
      ? data.agentBrainRuns
      : [];
  const droppedChatRunIds = new Set(
    shouldDropSeededChatHistory
      ? storedBrainRuns
          .filter((run) => run.intent === "conversation" || run.outputKind === "conversation")
          .map((run) => run.id)
      : [],
  );
  const droppedChatContextIds = new Set(
    storedBrainRuns
      .filter((run) => droppedChatRunIds.has(run.id))
      .map((run) => run.contextPackId),
  );
  const agentBrainRuns = storedBrainRuns.filter(
    (run) => !droppedChatRunIds.has(run.id),
  );
  const permissionGrants = ensurePermissionGrants(
    projects,
    Array.isArray(data.permissionGrants) ? data.permissionGrants : [],
  );

  return {
    artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
    initialized: true,
    storageBackend,
    workspaces,
    workspaceMembers: normalizeWorkspaceMembers(
      workspaces,
      resetMock ? [] : data.workspaceMembers ?? [],
    ),
    projects,
    tasks: resetMock ? [] : data.tasks ?? [],
    contacts: enrichContacts(resetMock ? [] : data.contacts ?? []),
    sessions: (shouldDropSeededChatHistory ? [] : data.sessions ?? []).filter((session) =>
      validProjectIds.has(session.projectId),
    ),
    messages: shouldDropSeededChatHistory ? [] : data.messages ?? [],
    researchDocs: normalizeResearchProjects(
      Array.isArray(data.researchDocs) && data.researchDocs.length > 0
        ? data.researchDocs
        : tradeifyResearchDocs,
      validProjectIds,
    ),
    teamMembers: mergeSeedTeammates(
      (resetMock ? [] : data.teamMembers ?? []).map(enrichTeamMember),
    ),
    teamMessages: resetMock ? [] : data.teamMessages ?? [],
    datasets:
      Array.isArray(data.datasets) && data.datasets.every(hasDatasetShape)
        ? data.datasets
        : [],
    agentRuns: Array.isArray(data.agentRuns) ? data.agentRuns : [],
    agentMemoryNotes: Array.isArray(data.agentMemoryNotes)
      ? data.agentMemoryNotes
      : [],
    agentBrainRuns,
    agentBrainSteps: Array.isArray(data.agentBrainSteps)
      ? data.agentBrainSteps.filter((step) => !droppedChatRunIds.has(step.runId))
      : [],
    agentBrainToolCalls: Array.isArray(data.agentBrainToolCalls)
      ? data.agentBrainToolCalls.filter((tool) => !droppedChatRunIds.has(tool.runId))
      : [],
    agentObservations: Array.isArray(data.agentObservations)
      ? data.agentObservations.filter(
          (observation) => !droppedChatRunIds.has(observation.runId),
        )
      : [],
    agentApprovals: Array.isArray(data.agentApprovals)
      ? data.agentApprovals.filter((approval) => !droppedChatRunIds.has(approval.runId))
      : [],
    agentContextPacks: Array.isArray(data.agentContextPacks)
      ? data.agentContextPacks.filter(
          (context) => !droppedChatContextIds.has(context.id),
        )
      : [],
    agentMemories: Array.isArray(data.agentMemories) ? data.agentMemories : [],
    permissionGrants,
    gatewayMessages: Array.isArray(data.gatewayMessages) ? data.gatewayMessages : [],
    workRuns: storedRuns,
    pendingArtifactPlans,
    deliveryOutputs: deliveryOutputs.filter(
      (output) => !output.runId || !droppedChatRunIds.has(output.runId),
    ),
    actionProposals: data.actionProposals ?? [],
    taskActivities: resetMock ? [] : data.taskActivities ?? seedTaskActivityItems,
    roadmapItems: resetMock ? [] : data.roadmapItems ?? seedRoadmapItems,
    plans: resetMock ? [] : Array.isArray(data.plans) ? data.plans : [],
    insights: resetMock ? [] : Array.isArray(data.insights) ? data.insights : [],
    worktrees: resetMock
      ? []
      : Array.isArray(data.worktrees)
        ? data.worktrees.map(normalizeWorktree)
        : [],
    headVersions: resetMock
      ? []
      : Array.isArray(data.headVersions)
        ? data.headVersions.map((head) => ({
            ...head,
            fileIds: head.fileIds ?? [],
            taskIds: head.taskIds ?? [],
          }))
        : [],
    activeHeadVersionByTeam:
      resetMock || typeof data.activeHeadVersionByTeam !== "object" || data.activeHeadVersionByTeam === null
        ? {}
        : data.activeHeadVersionByTeam,
    automations: resetMock ? [] : Array.isArray(data.automations) ? data.automations : [],
    scheduleEntries: resetMock ? [] : Array.isArray(data.scheduleEntries) ? data.scheduleEntries : [],
    workspaceFiles: resetMock
      ? []
      : Array.isArray(data.workspaceFiles)
        ? data.workspaceFiles
        : [],
    workspaceEvents: resetMock
      ? []
      : Array.isArray(data.workspaceEvents)
        ? data.workspaceEvents
        : [],
    notifications: resetMock ? [] : data.notifications ?? [],
    selectedWorkRunId: storedRuns.some((run) => run.id === data.selectedWorkRunId)
      ? data.selectedWorkRunId!
      : storedRuns[0]?.id ?? null,
  };
}

export const useDataStore = create<DataState>((set, get) => ({
  artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
  initialized: false,
  storageBackend: "memory",
  workspaces: defaultWorkspaces(),
  workspaceMembers: defaultWorkspaceMembers(defaultWorkspaces()),
  projects: defaultProjects(),
  tasks: [],
  contacts: [],
  sessions: [],
  messages: [],
  researchDocs: tradeifyResearchDocs,
  teamMembers: SEED_TEAMMATES,
  teamMessages: [],
  datasets: [],
  agentRuns: [],
  agentMemoryNotes: [],
  agentBrainRuns: [],
  agentBrainSteps: [],
  agentBrainToolCalls: [],
  agentObservations: [],
  agentApprovals: [],
  agentContextPacks: [],
  agentMemories: [],
  permissionGrants: ensurePermissionGrants(defaultProjects(), []),
  gatewayMessages: [],
  workRuns: [],
  pendingArtifactPlans: [],
  deliveryOutputs: [],
  actionProposals: [],
  taskActivities: seedTaskActivityItems,
  roadmapItems: seedRoadmapItems,
  plans: [],
  insights: [],
  worktrees: [],
  headVersions: [],
  activeHeadVersionByTeam: {},
  automations: [],
  scheduleEntries: [],
  workspaceFiles: [],
  workspaceEvents: [],
  notifications: [],
  selectedWorkRunId: null,

  initialize: async () => {
    if (get().initialized) return;

    const tauri = await isTauriRuntime();
    if (tauri) {
      try {
        const { initDatabase, loadAllData, bulkInsertResearchDocs } =
          await import("@/lib/db");
        await initDatabase();
        let data = await loadAllData();
        // Ensure the research corpus is present even for DBs created before the
        // research_docs table existed (seedDatabase only runs on a fresh DB).
        if (data.researchDocs.length === 0) {
          await bulkInsertResearchDocs(tradeifyResearchDocs);
          data = await loadAllData();
        }
        if (data.tasks.length > 0) {
          const validProjectIds = new Set(
            (data.projects ?? []).map((p) => p.id),
          );
          set({
            ...data,
            researchDocs: normalizeResearchProjects(
              data.researchDocs,
              validProjectIds,
            ),
            storageBackend: "sqlite",
            initialized: true,
          });
          return;
        }
        const { seedDatabase } = await import("@/lib/db");
        await seedDatabase();
        const seeded = await loadAllData();
        set({ ...seeded, storageBackend: "sqlite", initialized: true });
        return;
      } catch (err) {
        console.warn("SQLite unavailable, using in-memory data:", err);
      }
    }

    let browserDatabaseAvailable = isBrowserDatabaseAvailable();
    let storedData: PersistedDataPayload | null = null;
    let storageBackend: StorageBackend = browserDatabaseAvailable
      ? "indexeddb"
      : "localstorage";

    if (browserDatabaseAvailable) {
      try {
        storedData = await loadBrowserData<PersistedDataPayload>();
      } catch (err) {
        browserDatabaseAvailable = false;
        storageBackend = "localstorage";
        console.warn("IndexedDB unavailable, using localStorage backup:", err);
      }
    }

    if (!storedData && typeof window !== "undefined") {
      const stored = window.localStorage.getItem("crm-data");
      if (stored) {
        try {
          storedData = JSON.parse(stored) as PersistedDataPayload;
        } catch {
          storedData = null;
        }
      }
    }

    if (storedData) {
      set(hydratePersistedData(storedData, storageBackend));
      persistLocal(get());
      return;
    }

    set({
      storageBackend: browserDatabaseAvailable ? "indexeddb" : "localstorage",
      initialized: true,
    });
    persistLocal(get());
  },

  addTask: async (input) => {
    const now = new Date().toISOString();
    const tasks = get().tasks;
    const task: Task = {
      ...input,
      id: generateId("task"),
      identifier: generateIdentifier(input.projectId, tasks),
      createdAt: now,
      updatedAt: now,
    };

    set({
      tasks: [...tasks, task],
      taskActivities: [
        {
          id: generateId("activity"),
          projectId: task.projectId,
          taskId: task.id,
          type: "task_created",
          title: `${task.identifier} created`,
          description: task.title,
          actor: "User",
          createdAt: now,
        },
        ...get().taskActivities,
      ],
    });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(task.projectId, get()),
      projectId: task.projectId,
      source: "nexus",
      type: "task_created",
      title: `${task.identifier} created`,
      body: task.title,
      metadata: { taskId: task.id },
    });
    return task;
  },

  updateTaskStatus: async (id, status) => {
    const previous = get().tasks.find((task) => task.id === id);
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t,
    );
    set({
      tasks,
      taskActivities: previous
        ? [
            {
              id: generateId("activity"),
              projectId: previous.projectId,
              taskId: previous.id,
              type: "status_changed",
              title: `${previous.identifier} moved to ${status.replace("_", " ")}`,
              description: previous.title,
              actor: "User",
              createdAt: new Date().toISOString(),
            },
            ...get().taskActivities,
          ]
        : get().taskActivities,
    });

    if (await isTauriRuntime()) {
      try {
        const { updateTaskStatusDb } = await import("@/lib/db");
        await updateTaskStatusDb(id, status);
      } catch (err) {
        console.warn("Failed to persist task status:", err);
      }
    } else {
      persistLocal(get());
    }
    if (previous) {
      get().recordWorkspaceEvent({
        workspaceId: workspaceIdForProject(previous.projectId, get()),
        projectId: previous.projectId,
        source: "nexus",
        type: "task_status_changed",
        title: `${previous.identifier} moved to ${status.replace("_", " ")}`,
        body: previous.title,
        metadata: { taskId: previous.id, status },
      });
    }
  },

  addMessage: async (sessionId, content, role = "user") =>
    get().persistChatMessage(sessionId, content, role),

  persistChatMessage: async (sessionId, content, role = "user", id) => {
    const message: Message = {
      id: id ?? generateId("msg"),
      sessionId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };

    const messages = [...get().messages, message];
    const sessions = get().sessions.map((s) =>
      s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s,
    );

    set({ messages, sessions });

    if (await isTauriRuntime()) {
      try {
        const { insertMessage } = await import("@/lib/db");
        await insertMessage(message);
      } catch (err) {
        console.warn("Failed to persist message to SQLite:", err);
      }
    } else {
      persistLocal(get());
    }

    return message;
  },

  updateMessageContent: async (id, content) => {
    const messages = get().messages.map((message) =>
      message.id === id ? { ...message, content } : message,
    );
    set({ messages });
    persistLocal(get());
  },

  toggleMessageReaction: (id, emoji) => {
    const existing = get().messages.find((message) => message.id === id);
    const current = existing?.reactions ?? [];
    const added = !current.includes(emoji);
    const reactions = added
      ? [...current, emoji]
      : current.filter((value) => value !== emoji);
    const messages = get().messages.map((message) =>
      message.id === id ? { ...message, reactions } : message,
    );
    set({ messages });
    persistLocal(get());
    return { reactions, added };
  },

  getTeamMessagesByProject: (projectId) =>
    get()
      .teamMessages.filter((message) => message.projectId === projectId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),

  postTeamMessage: ({ projectId, body, mentions }) => {
    const now = new Date().toISOString();
    const message: TeamMessage = {
      id: generateId("teammsg"),
      projectId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatarUrl: currentUser.avatarUrl,
      body: body.trim(),
      mentions,
      createdAt: now,
    };
    set({ teamMessages: [...get().teamMessages, message] });

    // Reflect each @mention in the inbox so the called teammate is notified.
    // Mentions are workspace-wide, so resolve against all teammates.
    mentions.forEach((memberId) => {
      const member = get().teamMembers.find((m) => m.id === memberId);
      if (!member) return;
      get().addNotification({
        type: "mention",
        title: `${currentUser.name} mentioned ${member.name}`,
        body: message.body,
        projectId,
        actor: currentUser.name,
      });
    });

    persistLocal(get());
    return message;
  },

  addSession: async (projectId, title = "New session") => {
    const session: Session = {
      id: generateId("session"),
      projectId,
      title: title.length > 48 ? `${title.slice(0, 45)}…` : title,
      pinned: false,
      updatedAt: new Date().toISOString(),
    };

    set({ sessions: [session, ...get().sessions] });

    if (await isTauriRuntime()) {
      try {
        const { insertSession } = await import("@/lib/db");
        await insertSession(session);
      } catch (err) {
        console.warn("Failed to persist session:", err);
      }
    } else {
      persistLocal(get());
    }

    return session;
  },

  updateSessionTitle: async (sessionId, title) => {
    const nextTitle = title.length > 48 ? `${title.slice(0, 45)}…` : title;
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId
          ? { ...session, title: nextTitle, updatedAt: new Date().toISOString() }
          : session,
      ),
    });

    if (await isTauriRuntime()) {
      try {
        const { updateSessionTitleDb } = await import("@/lib/db");
        await updateSessionTitleDb(sessionId, nextTitle);
      } catch (err) {
        console.warn("Failed to update session title:", err);
      }
    } else {
      persistLocal(get());
    }
  },

  moveSession: (sessionId, projectId) => {
    const now = new Date().toISOString();
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId
          ? { ...session, projectId, updatedAt: now }
          : session,
      ),
    });
    persistLocal(get());
  },

  createPlan: ({ projectId, sessionId, draft }) => {
    const now = new Date().toISOString();
    const record: PlanRecord = {
      id: generateId("plan"),
      projectId,
      sessionId,
      title: draft.title,
      summary: draft.summary,
      steps: draft.steps.map((step) => ({
        id: generateId("step"),
        action: step.action,
        tier: normalizePlanTier(step.tier),
        detail: step.detail || undefined,
        done: false,
      })),
      assumptions: draft.assumptions ?? [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    set({ plans: [record, ...get().plans] });
    persistLocal(get());
    return record;
  },

  updatePlan: (id, patch) => {
    const now = new Date().toISOString();
    set({
      plans: get().plans.map((plan) =>
        plan.id === id ? { ...plan, ...patch, updatedAt: now } : plan,
      ),
    });
    persistLocal(get());
  },

  setPlanStatus: (id, status) => {
    const now = new Date().toISOString();
    set({
      plans: get().plans.map((plan) =>
        plan.id === id ? { ...plan, status, updatedAt: now } : plan,
      ),
    });
    persistLocal(get());
  },

  buildPlanTasks: (id) => {
    const plan = get().plans.find((item) => item.id === id);
    if (!plan) return [];
    // A standalone chat may not be tied to a project yet; fall back to the
    // first available project so the board still gets the steps (instead of
    // silently creating "0" tasks).
    const targetProjectId = plan.projectId ?? get().projects[0]?.id;
    if (!targetProjectId) return [];
    const now = new Date().toISOString();
    const nextTasks = [...get().tasks];
    const tierPriority: Record<string, Task["priority"]> = {
      approval: "high",
      strict: "medium",
      automatic: "low",
    };
    const created = plan.steps.map((step) => {
      const task: Task = {
        id: generateId("task"),
        projectId: targetProjectId,
        identifier: generateIdentifier(targetProjectId, nextTasks),
        title: step.action,
        status: "todo",
        description: step.detail,
        priority: tierPriority[step.tier] ?? "medium",
        createdAt: now,
        updatedAt: now,
      };
      nextTasks.push(task);
      return task;
    });

    set({
      tasks: nextTasks,
      plans: get().plans.map((item) =>
        item.id === id
          ? { ...item, projectId: targetProjectId, status: "approved", updatedAt: now }
          : item,
      ),
      taskActivities: [
        ...created.map((task) => ({
          id: generateId("activity"),
          projectId: task.projectId,
          taskId: task.id,
          type: "task_created" as const,
          title: `${task.identifier} created`,
          description: `${task.title} (from plan: ${plan.title})`,
          actor: "Agent" as const,
          createdAt: now,
        })),
        ...get().taskActivities,
      ],
    });
    persistLocal(get());
    return created;
  },

  getPlan: (id) => get().plans.find((plan) => plan.id === id),

  createInsight: (draft) => {
    const now = new Date().toISOString();
    const record: InsightRecord = {
      ...draft,
      id: generateId("insight"),
      createdAt: now,
      updatedAt: now,
    };
    set({ insights: [record, ...get().insights] });
    persistLocal(get());
    return record;
  },

  getInsight: (id) => get().insights.find((insight) => insight.id === id),

  ensureInsightDataset: async (projectId) => {
    const existing = get().datasets.find(
      (dataset) =>
        dataset.projectId === projectId &&
        !dataset.worktreeId && // only HEAD-lineage data, never staged worktree data
        dataset.columns.some(
          (column) => column.semanticRole === "revenue" || column.semanticRole === "sales",
        ),
    );
    if (existing) return existing;
    const { createSupermarketDataset } = await import("@/lib/insight/supermarket-data");
    const dataset = createSupermarketDataset(projectId);
    set({ datasets: [dataset, ...get().datasets] });
    persistLocal(get());
    return dataset;
  },

  // --- Worktrees + HEAD ------------------------------------------------------

  createWorktree: (teamId, name) => {
    const workspaceId = workspaceIdForProject(teamId, get());
    if (!get().canPerform(workspaceId, "stage_work")) {
      throw new Error("Not permitted to stage work in this workspace.");
    }
    const now = new Date().toISOString();
    const currentHead = get().getHeadVersion(teamId);
    const worktree: Worktree = {
      id: generateId("wt"),
      teamId,
      name: name.trim() || "Untitled branch",
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      status: "draft",
      baseHeadVersion: currentHead?.version,
      datasetIds: [],
      fileIds: [],
      stagedTaskIds: [],
      reviewers: [],
      createdAt: now,
      updatedAt: now,
    };
    set({ worktrees: [worktree, ...get().worktrees] });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(teamId, get()),
      projectId: teamId,
      worktreeId: worktree.id,
      source: "nexus",
      type: "branch_created",
      title: `${worktree.name} branch created`,
      body: `Created by ${currentUser.name}.`,
      metadata: { baseHeadVersion: currentHead?.version ?? 0 },
      createdAt: now,
    });
    return worktree;
  },

  getWorktree: (id) => get().worktrees.find((w) => w.id === id),

  getWorktreesByTeam: (teamId) =>
    get().worktrees.filter((w) => w.teamId === teamId && w.status !== "discarded"),

  importToWorktree: (worktreeId, name, domainId, text) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree) return null;
    const now = new Date().toISOString();
    const dataset: ProjectDataset = {
      ...createDatasetFromCsv({ projectId: worktree.teamId, name, domainId, text }),
      worktreeId,
    };
    set({
      datasets: [dataset, ...get().datasets],
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId
          ? { ...w, datasetIds: [dataset.id, ...w.datasetIds], updatedAt: now }
          : w,
      ),
    });
    persistLocal(get());
    return dataset;
  },

  addSampleToWorktree: (worktreeId, domainId) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree) return null;
    const now = new Date().toISOString();
    const dataset: ProjectDataset = {
      ...createSampleDataset(worktree.teamId, domainId),
      worktreeId,
    };
    set({
      datasets: [dataset, ...get().datasets],
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId
          ? { ...w, datasetIds: [dataset.id, ...w.datasetIds], updatedAt: now }
          : w,
      ),
    });
    persistLocal(get());
    return dataset;
  },

  getWorktreeDatasets: (worktreeId) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree) return [];
    const byId = new Map(get().datasets.map((d) => [d.id, d]));
    return worktree.datasetIds
      .map((id) => byId.get(id))
      .filter((d): d is ProjectDataset => Boolean(d));
  },

  getHeadVersion: (teamId) =>
    get()
      .headVersions.filter((h) => h.teamId === teamId)
      .sort((a, b) => b.version - a.version)[0],

  getHeadVersions: (teamId) =>
    get()
      .headVersions.filter((h) => h.teamId === teamId)
      .sort((a, b) => b.version - a.version),

  getHeadDatasets: (teamId) => {
    const head = get().getActiveHeadVersion(teamId);
    if (!head) return [];
    const byId = new Map(get().datasets.map((d) => [d.id, d]));
    return head.datasetIds
      .map((id) => byId.get(id))
      .filter((d): d is ProjectDataset => Boolean(d));
  },

  getActiveHeadVersion: (teamId) => {
    const versions = get()
      .headVersions.filter((h) => h.teamId === teamId)
      .sort((a, b) => b.version - a.version);
    if (versions.length === 0) return undefined;
    const pinned = get().activeHeadVersionByTeam[teamId];
    if (pinned != null) {
      const match = versions.find((h) => h.version === pinned);
      if (match) return match;
    }
    return versions[0];
  },

  pinHeadVersion: (teamId, version) => {
    if (!get().canPerform(workspaceIdForProject(teamId, get()), "approve_worktree")) return;
    const target = get().headVersions.find(
      (h) => h.teamId === teamId && h.version === version,
    );
    const latest = get().getHeadVersion(teamId);
    if (!target || !latest) return;
    // Pinning the latest is just "resume latest" — keep the pointer clean.
    if (version >= latest.version) {
      get().resumeLatestHead(teamId);
      return;
    }
    set({
      activeHeadVersionByTeam: { ...get().activeHeadVersionByTeam, [teamId]: version },
    });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(teamId, get()),
      projectId: teamId,
      headVersion: version,
      source: "nexus",
      type: "head_rolled_back",
      title: `Rolled back to HEAD v${version}`,
      body: `Downstream reads now follow ${target.label}.`,
      createdAt: new Date().toISOString(),
    });
  },

  resumeLatestHead: (teamId) => {
    if (get().activeHeadVersionByTeam[teamId] == null) return;
    const { [teamId]: _removed, ...rest } = get().activeHeadVersionByTeam;
    set({ activeHeadVersionByTeam: rest });
    persistLocal(get());
    const latest = get().getHeadVersion(teamId);
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(teamId, get()),
      projectId: teamId,
      headVersion: latest?.version,
      source: "nexus",
      type: "head_rolled_back",
      title: "Resumed latest HEAD",
      body: latest ? `Active version is ${latest.label}.` : "Following latest HEAD.",
      createdAt: new Date().toISOString(),
    });
  },

  summarizePromotionForWorktree: (worktreeId) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree) return null;
    const byId = new Map(get().datasets.map((d) => [d.id, d]));
    const headDatasets = get().getHeadDatasets(worktree.teamId);
    const worktreeDatasets = worktree.datasetIds
      .map((id) => byId.get(id))
      .filter((d): d is ProjectDataset => Boolean(d));
    const stagedFiles = get().getFilesByWorktree(worktree.id);
    const stagedTasks = stagedTasksForWorktree(get().tasks, worktree.id);
    return summarizePromotion({ headDatasets, worktreeDatasets, stagedFiles, stagedTasks });
  },

  ensureHead: (teamId) => {
    const existing = get()
      .headVersions.filter((h) => h.teamId === teamId)
      .sort((a, b) => b.version - a.version)[0];
    if (existing) return existing;
    // Seed HEAD v1 from the team's existing canonical (non-worktree) files,
    // datasets, and board tasks.
    const baseDatasets = get().datasets.filter(
      (d) => d.projectId === teamId && !d.worktreeId,
    );
    const baseFiles = get().workspaceFiles.filter(
      (file) => file.projectId === teamId && !file.worktreeId,
    );
    const baseTasks = canonicalTasksForProject(get().tasks, teamId);
    if (baseDatasets.length === 0 && baseFiles.length === 0 && baseTasks.length === 0) {
      return undefined;
    }
    const now = new Date().toISOString();
    const head: HeadVersion = {
      id: generateId("head"),
      teamId,
      version: 1,
      label: "v1 — initial",
      datasetIds: baseDatasets.map((d) => d.id),
      fileIds: baseFiles.map((file) => file.id),
      taskIds: baseTasks.map((task) => task.id),
      createdBy: currentUser.id,
      createdAt: now,
    };
    set({ headVersions: [head, ...get().headVersions] });
    persistLocal(get());
    return head;
  },

  requestWorktreePromotion: (worktreeId, note) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (
      !worktree ||
      worktree.status !== "draft" ||
      worktree.datasetIds.length + worktree.fileIds.length + worktree.stagedTaskIds.length === 0
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const workspaceId = workspaceIdForProject(worktree.teamId, get());
    if (!get().canPerform(workspaceId, "stage_work")) return null;
    const reviewers = get()
      .workspaceMembers.filter(
        (member) =>
          member.workspaceId === workspaceId &&
          (member.role === "owner" || member.role === "lead"),
      )
      .map((member) => ({
        id: member.userId,
        name: member.name,
        status: "requested" as const,
      }));
    const updated: Worktree = {
      ...worktree,
      status: "in_review",
      note: note ?? worktree.note,
      reviewers,
      requestedAt: now,
      updatedAt: now,
    };
    set({ worktrees: get().worktrees.map((w) => (w.id === worktreeId ? updated : w)) });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId,
      projectId: worktree.teamId,
      worktreeId,
      source: "nexus",
      type: "review_requested",
      title: `${worktree.name} requested review`,
      body: note || "Branch is ready for lead review.",
      metadata: {
        files: worktree.fileIds.length,
        tasks: worktree.stagedTaskIds.length,
        datasets: worktree.datasetIds.length,
      },
      createdAt: now,
    });
    get().addNotification({
      type: "worktree_review",
      title: `${worktree.name} is ready for review`,
      body: note || "A team branch needs approval before promotion.",
      projectId: worktree.teamId,
      actor: currentUser.name,
    });
    return updated;
  },

  promoteWorktree: (worktreeId) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (
      !worktree ||
      worktree.status !== "in_review" ||
      worktree.datasetIds.length + worktree.fileIds.length + worktree.stagedTaskIds.length === 0
    ) {
      return null;
    }
    if (!get().canPerform(workspaceIdForProject(worktree.teamId, get()), "approve_worktree")) {
      return null;
    }
    const teamId = worktree.teamId;
    const prev = get()
      .headVersions.filter((h) => h.teamId === teamId)
      .sort((a, b) => b.version - a.version)[0];
    const byId = new Map(get().datasets.map((d) => [d.id, d]));
    const headDatasets = prev
      ? (prev.datasetIds.map((id) => byId.get(id)).filter(Boolean) as ProjectDataset[])
      : [];
    const worktreeDatasets = worktree.datasetIds
      .map((id) => byId.get(id))
      .filter(Boolean) as ProjectDataset[];
    const version = (prev?.version ?? 0) + 1;
    const now = new Date().toISOString();
    const { newDatasets, datasetIds } = buildPromotedHead({
      version,
      headDatasets,
      worktreeDatasets,
      makeId: generateId,
      now,
    });
    const stagedFiles = worktree.fileIds
      .map((id) => get().workspaceFiles.find((file) => file.id === id))
      .filter((file): file is WorkspaceFile => Boolean(file));
    const newFiles = stagedFiles.map((file) => ({
      ...file,
      id: generateId("file"),
      worktreeId: undefined,
      headVersion: version,
      createdAt: now,
      updatedAt: now,
    }));
    const existingHeadFileIds =
      prev?.fileIds ??
      get()
        .workspaceFiles.filter((file) => file.projectId === teamId && !file.worktreeId)
        .map((file) => file.id);
    const stagedTasks = stagedTasksForWorktree(get().tasks, worktree.id);
    const existingHeadTaskIds =
      prev?.taskIds ?? canonicalTasksForProject(get().tasks, teamId).map((task) => task.id);
    const taskSeed = [...get().tasks];
    const newTasks = stagedTasks.map((task) => {
      const promoted: Task = {
        ...task,
        id: generateId("task"),
        identifier: generateIdentifier(teamId, taskSeed),
        worktreeId: undefined,
        headVersion: version,
        createdAt: now,
        updatedAt: now,
      };
      taskSeed.push(promoted);
      return promoted;
    });
    const head: HeadVersion = {
      id: generateId("head"),
      teamId,
      version,
      label: headVersionLabel(version, worktree.name),
      datasetIds,
      fileIds: [...existingHeadFileIds, ...newFiles.map((file) => file.id)],
      taskIds: [...existingHeadTaskIds, ...newTasks.map((task) => task.id)],
      sourceWorktreeId: worktree.id,
      note: worktree.note,
      createdBy: currentUser.id,
      createdAt: now,
      parentVersion: prev?.version,
    };
    // Drop the branch-local staged originals now that immutable HEAD snapshots
    // exist — otherwise they accumulate forever behind their worktreeId.
    const stagedDatasetIds = new Set(worktree.datasetIds);
    const stagedFileIds = new Set(worktree.fileIds);
    const stagedTaskIds = new Set(stagedTasks.map((task) => task.id));
    const { [teamId]: _cleared, ...remainingActiveHead } = get().activeHeadVersionByTeam;
    set({
      datasets: [...newDatasets, ...get().datasets.filter((d) => !stagedDatasetIds.has(d.id))],
      workspaceFiles: [
        ...newFiles,
        ...get().workspaceFiles.filter((file) => !stagedFileIds.has(file.id)),
      ],
      tasks: [...newTasks, ...get().tasks.filter((task) => !stagedTaskIds.has(task.id))],
      headVersions: [head, ...get().headVersions],
      // Promotion advances the active pointer to the new latest version.
      activeHeadVersionByTeam: remainingActiveHead,
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId
          ? {
              ...w,
              status: "promoted",
              promotedToVersion: version,
              reviewedAt: now,
              reviewedBy: currentUser.name,
              reviewers: w.reviewers.map((reviewer) =>
                reviewer.id === currentUser.id
                  ? { ...reviewer, status: "approved", reviewedAt: now }
                  : reviewer,
              ),
              updatedAt: now,
            }
          : w,
      ),
      taskActivities: [
        ...newTasks.map((task) => ({
          id: generateId("activity"),
          projectId: task.projectId,
          taskId: task.id,
          type: "task_created" as const,
          title: `${task.identifier} promoted from branch`,
          description: task.title,
          actor: "User" as const,
          createdAt: now,
        })),
        ...get().taskActivities,
      ],
    });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(teamId, get()),
      projectId: teamId,
      worktreeId,
      headVersion: version,
      source: "nexus",
      type: "head_promoted",
      title: `${worktree.name} promoted to HEAD v${version}`,
      body: `${newFiles.length} files and ${newTasks.length} tasks became canonical.`,
      metadata: {
        files: newFiles.length,
        tasks: newTasks.length,
        datasets: newDatasets.length,
      },
      createdAt: now,
    });
    return head;
  },

  approveWorktreePromotion: (worktreeId) => get().promoteWorktree(worktreeId),

  rejectWorktreePromotion: (worktreeId, reason) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree || worktree.status !== "in_review") return null;
    const now = new Date().toISOString();
    const updated: Worktree = {
      ...worktree,
      status: "draft",
      rejectionReason: reason,
      reviewedAt: now,
      reviewedBy: currentUser.name,
      reviewers: worktree.reviewers.map((reviewer) =>
        reviewer.id === currentUser.id
          ? { ...reviewer, status: "rejected", reviewedAt: now }
          : reviewer,
      ),
      updatedAt: now,
    };
    set({ worktrees: get().worktrees.map((w) => (w.id === worktreeId ? updated : w)) });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(worktree.teamId, get()),
      projectId: worktree.teamId,
      worktreeId,
      source: "nexus",
      type: "promotion_rejected",
      title: `${worktree.name} review rejected`,
      body: reason || "Returned to draft for more work.",
      createdAt: now,
    });
    return updated;
  },

  discardWorktree: (worktreeId) => {
    const now = new Date().toISOString();
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    // Reclaim the branch's staged datasets/files/tasks — none of it ever
    // reached HEAD, so it can be dropped outright.
    const stagedDatasetIds = new Set(worktree?.datasetIds ?? []);
    const stagedFileIds = new Set(worktree?.fileIds ?? []);
    const stagedTaskIds = new Set(worktree?.stagedTaskIds ?? []);
    set({
      datasets: get().datasets.filter((d) => !stagedDatasetIds.has(d.id)),
      workspaceFiles: get().workspaceFiles.filter((file) => !stagedFileIds.has(file.id)),
      tasks: get().tasks.filter((task) => !stagedTaskIds.has(task.id)),
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId ? { ...w, status: "discarded", updatedAt: now } : w,
      ),
    });
    persistLocal(get());
    if (worktree) {
      get().recordWorkspaceEvent({
        workspaceId: workspaceIdForProject(worktree.teamId, get()),
        projectId: worktree.teamId,
        worktreeId,
        source: "nexus",
        type: "promotion_rejected",
        title: `${worktree.name} discarded`,
        body: "Branch was removed from the active workflow.",
        createdAt: now,
      });
    }
  },

  stageFileToWorktree: (worktreeId, input) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree || worktree.status !== "draft") return null;
    const now = new Date().toISOString();
    const workspaceId = workspaceIdForProject(worktree.teamId, get());
    if (!get().canPerform(workspaceId, "stage_work")) return null;
    const content = input.content?.trim();
    const dataset =
      input.kind === "csv" && content
        ? {
            ...createDatasetFromCsv({
              projectId: worktree.teamId,
              name: input.name || "Staged CSV",
              domainId: input.domainId ?? "general",
              text: content,
            }),
            worktreeId,
          }
        : null;
    const file: WorkspaceFile = {
      id: generateId("file"),
      workspaceId,
      projectId: worktree.teamId,
      name: input.name.trim() || "Untitled file",
      kind: input.kind,
      content,
      sourceUrl: input.sourceUrl?.trim() || undefined,
      datasetId: dataset?.id,
      size: content?.length,
      worktreeId,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };
    set({
      workspaceFiles: [file, ...get().workspaceFiles],
      datasets: dataset ? [dataset, ...get().datasets] : get().datasets,
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId
          ? {
              ...w,
              fileIds: [file.id, ...w.fileIds],
              datasetIds: dataset ? [dataset.id, ...w.datasetIds] : w.datasetIds,
              updatedAt: now,
            }
          : w,
      ),
    });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId,
      projectId: worktree.teamId,
      worktreeId,
      source: "nexus",
      type: "file_staged",
      title: `${file.name} staged`,
      body: dataset ? "CSV parsed into a staged dataset." : "File metadata staged in the branch.",
      metadata: { fileId: file.id, kind: file.kind, datasetId: dataset?.id ?? null },
      createdAt: now,
    });
    return file;
  },

  stageTaskToWorktree: (worktreeId, input) => {
    const worktree = get().worktrees.find((w) => w.id === worktreeId);
    if (!worktree || worktree.status !== "draft" || !input.title.trim()) return null;
    if (!get().canPerform(workspaceIdForProject(worktree.teamId, get()), "stage_work")) return null;
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId("task"),
      projectId: worktree.teamId,
      identifier: generateIdentifier(worktree.teamId, get().tasks),
      title: input.title.trim(),
      status: "todo",
      description: input.description?.trim() || undefined,
      priority: input.priority ?? "medium",
      dueDate: input.dueDate,
      assignee: input.assignee?.trim() || undefined,
      worktreeId,
      createdAt: now,
      updatedAt: now,
    };
    set({
      tasks: [task, ...get().tasks],
      worktrees: get().worktrees.map((w) =>
        w.id === worktreeId
          ? { ...w, stagedTaskIds: [task.id, ...w.stagedTaskIds], updatedAt: now }
          : w,
      ),
    });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(worktree.teamId, get()),
      projectId: worktree.teamId,
      worktreeId,
      source: "nexus",
      type: "task_staged",
      title: `${task.identifier} staged`,
      body: task.title,
      metadata: { taskId: task.id },
      createdAt: now,
    });
    return task;
  },

  getWorkspaceFilesByProject: (projectId) =>
    get().workspaceFiles.filter((file) => file.projectId === projectId),

  getCanonicalFilesByProject: (projectId) => {
    // When a HEAD version is active (incl. a rollback pin), canonical = that
    // version's file composition. Before any promotion, fall back to all
    // non-worktree files so freshly seeded teams still show their files.
    const head = get().getActiveHeadVersion(projectId);
    const nonWorktree = get().workspaceFiles.filter(
      (file) => file.projectId === projectId && !file.worktreeId,
    );
    if (!head) return nonWorktree;
    const inHead = new Set(head.fileIds);
    return nonWorktree.filter((file) => inHead.has(file.id));
  },

  getFilesByWorktree: (worktreeId) =>
    get().workspaceFiles.filter((file) => file.worktreeId === worktreeId),

  getWorkspaceEventsByProject: (projectId) =>
    get()
      .workspaceEvents.filter((event) => event.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  getEventsByWorktree: (worktreeId) =>
    get()
      .workspaceEvents.filter((event) => event.worktreeId === worktreeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  automatePlan: (id) => {
    const plan = get().plans.find((item) => item.id === id);
    if (!plan) return [];
    const existing = get().automations.filter((rule) => rule.planId === id);
    if (existing.length > 0) return existing;
    const now = new Date().toISOString();
    const created: AutomationRule[] = plan.steps.map((step, index) => {
      const { name, trigger, action } = deriveAutomationFields(step, index);
      return {
        id: generateId("auto"),
        planId: plan.id,
        projectId: plan.projectId,
        sessionId: plan.sessionId,
        stepId: step.id,
        name,
        trigger,
        action,
        tier: step.tier,
        status: "active" as const,
        createdAt: now,
      };
    });
    set({ automations: [...created, ...get().automations] });
    persistLocal(get());
    return created;
  },

  schedulePlan: (id) => {
    const plan = get().plans.find((item) => item.id === id);
    if (!plan) return [];
    const existing = get().scheduleEntries.filter((entry) => entry.planId === id);
    if (existing.length > 0) return existing;
    const now = new Date().toISOString();
    const automationsByStep = new Map(
      get()
        .automations.filter((rule) => rule.planId === id)
        .map((rule) => [rule.stepId, rule]),
    );
    // Best-effort link to the board tasks created from this plan (matched by
    // title within the plan's project) so each gets a due date.
    const projectTasks = plan.projectId
      ? canonicalTasksForProject(get().tasks, plan.projectId)
      : [];
    const taskByTitle = new Map(projectTasks.map((task) => [task.title.trim(), task]));

    const created: ScheduleEntry[] = plan.steps.map((step, index) => {
      const startDate = deriveStartDate(index);
      const task = taskByTitle.get(step.action.trim());
      return {
        id: generateId("sched"),
        planId: plan.id,
        projectId: plan.projectId,
        stepId: step.id,
        automationId: automationsByStep.get(step.id)?.id,
        taskId: task?.id,
        title: step.action,
        cadence: deriveCadence(step),
        startDate,
        status: "scheduled" as const,
        createdAt: now,
      };
    });

    const dueDateByTask = new Map(
      created
        .filter((entry) => entry.taskId)
        .map((entry) => [entry.taskId as string, formatScheduleDate(entry.startDate)]),
    );

    set({
      scheduleEntries: [...created, ...get().scheduleEntries],
      tasks: get().tasks.map((task) =>
        dueDateByTask.has(task.id)
          ? { ...task, dueDate: dueDateByTask.get(task.id), updatedAt: now }
          : task,
      ),
    });
    persistLocal(get());
    return created;
  },

  setAutomationStatus: (id, status) => {
    set({
      automations: get().automations.map((rule) =>
        rule.id === id ? { ...rule, status } : rule,
      ),
    });
    persistLocal(get());
  },

  getAutomationsByPlan: (planId) =>
    get().automations.filter((rule) => rule.planId === planId),

  getScheduleByPlan: (planId) =>
    get().scheduleEntries.filter((entry) => entry.planId === planId),

  archiveSession: (sessionId) => {
    const now = new Date().toISOString();
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId ? { ...session, archivedAt: now, updatedAt: now } : session,
      ),
    });
    persistLocal(get());
  },

  addProject: async (name, workspaceId) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: generateId("proj"),
      workspaceId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      createdAt: now,
      createdBy: currentUser.id,
    };
    set({
      projects: [...get().projects, project],
      permissionGrants: [
        ...get().permissionGrants,
        ...defaultPermissionGrants(project.id, now),
      ],
    });
    persistLocal(get());
    return project;
  },

  // Name the primary workspace after the firm (from onboarding). Team projects
  // keep their template names (Risk Team, Marketing Team, …).
  applyFirmName: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => ({
      workspaces: state.workspaces.map((workspace, index) =>
        index === 0 ? { ...workspace, name: trimmed } : workspace,
      ),
    }));
    persistLocal(get());
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: generateId("notif"),
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...state.notifications,
      ].slice(0, 100),
    }));
    persistLocal(get());
  },

  markNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    }));
    persistLocal(get());
  },

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
    }));
    persistLocal(get());
  },

  recordWorkspaceEvent: (input) => {
    const event: WorkspaceEvent = {
      ...input,
      id: generateId("event"),
      actorId: input.actorId ?? currentUser.id,
      actorName: input.actorName ?? currentUser.name,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    set({ workspaceEvents: [event, ...get().workspaceEvents].slice(0, 500) });
    persistLocal(get());
    return event;
  },

  getEffectiveRole: (workspaceId) =>
    effectiveRoleForUser({
      workspaceId: workspaceId ?? get().workspaces[0]?.id ?? "ws-1",
      userId: currentUser.id,
      members: get().workspaceMembers,
    }),

  canPerform: (workspaceId, capability) =>
    canRolePerform(get().getEffectiveRole(workspaceId), capability),

  archiveProject: (projectId) => {
    const now = new Date().toISOString();
    set({
      projects: get().projects.map((project) =>
        project.id === projectId ? { ...project, archivedAt: now } : project,
      ),
      sessions: get().sessions.map((session) =>
        session.projectId === projectId && !session.archivedAt
          ? { ...session, archivedAt: now, updatedAt: now }
          : session,
      ),
    });
    persistLocal(get());
  },

  importCsvDataset: (projectId, name, domainId, text) => {
    const dataset = createDatasetFromCsv({ projectId, name, domainId, text });
    set({ datasets: [dataset, ...get().datasets] });
    persistLocal(get());
    return dataset;
  },

  addSampleDataset: (projectId, domainId) => {
    const dataset = createSampleDataset(projectId, domainId);
    set({ datasets: [dataset, ...get().datasets] });
    persistLocal(get());
    return dataset;
  },

  addKnowledgePackDataset: (projectId, packId) => {
    const dataset = createKnowledgePackDataset(projectId, packId);
    set({ datasets: [dataset, ...get().datasets] });
    persistLocal(get());
    return dataset;
  },

  updateDatasetColumnRole: (datasetId, columnKey, semanticRole) => {
    set({
      datasets: get().datasets.map((dataset) =>
        dataset.id === datasetId
          ? {
              ...dataset,
              columns: dataset.columns.map((column) =>
                column.key === columnKey ? { ...column, semanticRole } : column,
              ),
              updatedAt: new Date().toISOString(),
            }
          : dataset,
      ),
    });
    persistLocal(get());
  },

  startAgentBrainRun: (input) => {
    const state = get();
    const now = new Date().toISOString();
    const projectId = input.projectId;
    const intent = input.intent ?? classifyAgentIntent(input.request);
    const domainId = domainFromPrompt(input.request);
    const outputKind =
      input.outputKind ??
      (intent === "brief"
        ? "plan"
        : intent === "task_proposal"
          ? "task_proposal"
          : intent === "gateway_notification"
            ? "gateway_notification"
            : "conversation");
    const contextPack = buildAgentContextPack({
      projectId,
      tasks: canonicalTasksForProject(state.tasks, projectId),
      datasets: state.datasets.filter((dataset) => dataset.projectId === projectId && !dataset.worktreeId),
      contacts: state.contacts.filter((contact) => contact.projectId === projectId),
      teamMembers: state.teamMembers.filter((member) => member.projectId === projectId),
      memories: state.agentMemories.filter((memory) => memory.projectId === projectId),
      workRuns: state.workRuns.filter((run) => run.projectId === projectId).slice(0, 5),
    });
    const run: AgentBrainRun = {
      id: generateId("brain-run"),
      projectId,
      sessionId: input.sessionId,
      gatewayMessageId: input.gatewayMessageId,
      title: input.title ?? `${intent.replace(/_/g, " ")} run`,
      request: input.request,
      intent,
      status: "running",
      trustLevel: 0,
      currentStage: "retrieve_context",
      contextPackId: contextPack.id,
      outputKind,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    };
    const steps: AgentBrainStep[] = [
      {
        id: generateId("brain-step"),
        runId: run.id,
        projectId,
        stage: "ingest",
        title: "Request received",
        detail: input.gatewayMessageId
          ? "Gateway message normalized into a Nexus agent run."
          : "Chat request normalized into a Nexus agent run.",
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
      {
        id: generateId("brain-step"),
        runId: run.id,
        projectId,
        stage: "classify",
        title: "Intent classified",
        detail: `Intent: ${intent.replace(/_/g, " ")}. Domain signal: ${domainId.replace(/_/g, " ")}.`,
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
      {
        id: generateId("brain-step"),
        runId: run.id,
        projectId,
        stage: "retrieve_context",
        title: "Project context retrieved",
        detail: contextPack.summary,
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
    ];
    const toolCall: AgentBrainToolCall = {
      id: generateId("brain-tool"),
      runId: run.id,
      projectId,
      toolId: "inspect_project_context",
      toolName: "Inspect project context",
      risk: "low",
      status: "success",
      inputSummary: "Collect project chat, tasks, board, briefs, people, datasets, and memory.",
      outputSummary: contextPack.summary,
      createdAt: now,
      completedAt: now,
    };
    const observation: AgentObservation = {
      id: generateId("observation"),
      runId: run.id,
      projectId,
      title: "Context pack ready",
      body: contextPack.summary,
      sourceIds: [contextPack.id],
      createdAt: now,
    };
    const output: AgentDeliveryOutput = {
      id: `delivery-${run.id}`,
      kind: outputKind,
      status: "running",
      title: run.title,
      detail: contextPack.summary,
      sessionId: input.sessionId,
      projectId,
      runId: run.id,
      createdAt: now,
      updatedAt: now,
    };

    set({
      agentContextPacks: [contextPack, ...state.agentContextPacks],
      agentBrainRuns: [run, ...state.agentBrainRuns],
      agentBrainSteps: [...steps, ...state.agentBrainSteps],
      agentBrainToolCalls: [toolCall, ...state.agentBrainToolCalls],
      agentObservations: [observation, ...state.agentObservations],
      permissionGrants: ensurePermissionGrants(state.projects, state.permissionGrants),
      deliveryOutputs: [output, ...state.deliveryOutputs.filter((item) => item.id !== output.id)],
      gatewayMessages: input.gatewayMessageId
        ? state.gatewayMessages.map((message) =>
            message.id === input.gatewayMessageId
              ? { ...message, status: "routed", runId: run.id }
              : message,
          )
        : state.gatewayMessages,
    });
    persistLocal(get());
    const gatewaySource = input.gatewayMessageId
      ? state.gatewayMessages.find((message) => message.id === input.gatewayMessageId)?.channel ?? "webhook"
      : "nexus";
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(projectId, get()),
      projectId,
      source: gatewaySource,
      type: "agent_run_started",
      title: `${run.title} started`,
      body: contextPack.summary,
      metadata: { runId: run.id, intent: run.intent },
      createdAt: now,
    });
    return run;
  },

  advanceAgentBrainRun: (runId, stage, title, detail) => {
    const state = get();
    const run = state.agentBrainRuns.find((item) => item.id === runId);
    if (!run) return null;

    const now = new Date().toISOString();
    const step: AgentBrainStep = {
      id: generateId("brain-step"),
      runId,
      projectId: run.projectId,
      stage,
      title,
      detail,
      status: "completed",
      createdAt: now,
      completedAt: now,
    };

    set({
      agentBrainRuns: state.agentBrainRuns.map((item) =>
        item.id === runId
          ? { ...item, currentStage: stage, status: "running", updatedAt: now }
          : item,
      ),
      agentBrainSteps: [...state.agentBrainSteps, step],
      deliveryOutputs: state.deliveryOutputs.map((output) =>
        output.runId === runId ? { ...output, status: "running", updatedAt: now } : output,
      ),
    });
    persistLocal(get());
    return step;
  },

  completeAgentBrainRun: (runId, status = "completed", error) => {
    const state = get();
    const now = new Date().toISOString();
    const run = state.agentBrainRuns.find((item) => item.id === runId);
    const outputStatus: AgentDeliveryOutput["status"] =
      status === "completed"
        ? "completed"
        : status === "failed"
          ? "failed"
          : status === "needs_approval"
            ? "pending"
            : "running";
    const approval: AgentApproval | null =
      status === "needs_approval" && run
        ? {
            id: generateId("approval"),
            runId,
            projectId: run.projectId,
            action:
              run.outputKind === "artifact" || run.intent === "brief"
                ? "Approve artifact production"
                : "Approve proposed action",
            risk: run.outputKind === "artifact" || run.intent === "brief" ? "medium" : "low",
            status: "pending",
            reason: "Graduated trust requires a user decision before Nexus applies or produces this output.",
            createdAt: now,
          }
        : null;

    set({
      agentBrainRuns: state.agentBrainRuns.map((run) =>
        run.id === runId
          ? {
              ...run,
              status,
              error,
              updatedAt: now,
              completedAt: status === "completed" || status === "failed" ? now : run.completedAt,
            }
          : run,
      ),
      deliveryOutputs: state.deliveryOutputs.map((output) =>
        output.runId === runId ? { ...output, status: outputStatus, updatedAt: now } : output,
      ),
      agentApprovals: approval
        ? [
            approval,
            ...state.agentApprovals.filter(
              (item) => !(item.runId === approval.runId && item.status === "pending"),
            ),
          ]
        : state.agentApprovals,
    });
    persistLocal(get());
  },

  recordAgentObservation: (runId, title, body, sourceIds = []) => {
    const run = get().agentBrainRuns.find((item) => item.id === runId);
    if (!run) return null;
    const observation: AgentObservation = {
      id: generateId("observation"),
      runId,
      projectId: run.projectId,
      title,
      body,
      sourceIds,
      createdAt: new Date().toISOString(),
    };
    set({ agentObservations: [observation, ...get().agentObservations] });
    persistLocal(get());
    return observation;
  },

  recordAgentMemory: (input) => {
    const now = new Date().toISOString();
    const memory: AgentMemoryItem = {
      id: generateId("memory"),
      projectId: input.projectId,
      runId: input.runId,
      kind: input.kind ?? memoryKindForText(`${input.title} ${input.body}`),
      title: input.title,
      body: input.body,
      confidence: input.confidence ?? 0.7,
      source: input.source ?? "agent",
      pinned: input.pinned,
      createdAt: now,
      updatedAt: now,
    };
    set({ agentMemories: [memory, ...get().agentMemories] });
    persistLocal(get());
    return memory;
  },

  updateAgentMemory: (id, patch) => {
    const now = new Date().toISOString();
    set({
      agentMemories: get().agentMemories.map((memory) =>
        memory.id === id ? { ...memory, ...patch, updatedAt: now } : memory,
      ),
    });
    persistLocal(get());
  },

  deleteAgentMemory: (id) => {
    set({ agentMemories: get().agentMemories.filter((memory) => memory.id !== id) });
    persistLocal(get());
  },

  upsertPermissionGrant: (grant) => {
    const now = new Date().toISOString();
    const nextGrant = { ...grant, updatedAt: now };
    set({
      permissionGrants: [
        nextGrant,
        ...get().permissionGrants.filter((item) => item.id !== grant.id),
      ],
    });
    persistLocal(get());
    return nextGrant;
  },

  updatePermissionGrant: (id, status, trustLevel) => {
    const now = new Date().toISOString();
    set({
      permissionGrants: get().permissionGrants.map((grant) =>
        grant.id === id
          ? {
              ...grant,
              status,
              trustLevel: trustLevel ?? grant.trustLevel,
              updatedAt: now,
            }
          : grant,
      ),
    });
    persistLocal(get());
  },

  createGatewayMessage: (input) => {
    const channelLabel = defaultGatewayChannelLabel(input.channel);
    const message: GatewayMessage = {
      id: generateId("gateway"),
      projectId: input.projectId,
      channel: input.channel,
      externalThreadId: input.externalThreadId,
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      eventType: input.eventType,
      metadata: input.metadata,
      sender: input.sender || channelLabel,
      text: input.text,
      status: "received",
      createdAt: new Date().toISOString(),
    };
    set({ gatewayMessages: [message, ...get().gatewayMessages] });
    persistLocal(get());
    get().recordWorkspaceEvent({
      workspaceId: workspaceIdForProject(input.projectId, get()),
      projectId: input.projectId,
      source: input.channel,
      type: "gateway_received",
      title: `${channelLabel} message received`,
      body: `${message.sender}: ${message.text}`,
      externalId: input.externalId ?? input.externalThreadId,
      externalUrl: input.externalUrl,
      metadata: { eventType: input.eventType ?? "message", ...(input.metadata ?? {}) },
      createdAt: message.createdAt,
    });
    return message;
  },

  routeGatewayMessage: (messageId, runId) => {
    set({
      gatewayMessages: get().gatewayMessages.map((message) =>
        message.id === messageId ? { ...message, status: "routed", runId } : message,
      ),
    });
    persistLocal(get());
  },

  createWorkRunFromPrompt: async (prompt, projectId) => {
    const state = get();
    const targetProjectId = projectId ?? state.projects[0]?.id ?? "proj-1";
    const context = buildRunContext(targetProjectId, state);
    const { workRun, agentRun, memoryNotes } = runBusinessIntelligenceAgent({
      prompt,
      ...context,
      datasets: state.datasets.filter(
        (dataset) => dataset.projectId === targetProjectId && !dataset.worktreeId,
      ),
    });

    set({
      workRuns: [workRun, ...state.workRuns],
      agentRuns: [agentRun, ...state.agentRuns],
      agentMemoryNotes: [...memoryNotes, ...state.agentMemoryNotes],
      selectedWorkRunId: workRun.id,
    });
    persistLocal(get());

    void generateBriefWithLocalModel({ workRun, agentRun })
      .then((brief) => {
        if (!brief.used) return;
        const current = get();
        const currentWorkRun = current.workRuns.find((run) => run.id === workRun.id);
        const currentAgentRun = current.agentRuns.find((run) => run.id === agentRun.id);
        if (!currentWorkRun || !currentAgentRun) return;
        const generated = applyLocalModelBrief({
          workRun: currentWorkRun,
          agentRun: currentAgentRun,
          brief,
        });
        set({
          workRuns: current.workRuns.map((run) =>
            run.id === workRun.id ? generated.workRun : run,
          ),
          agentRuns: current.agentRuns.map((run) =>
            run.id === agentRun.id ? generated.agentRun : run,
          ),
        });
        persistLocal(get());
      })
      .catch((error) => {
        console.warn("Local model brief generation skipped:", error);
      });

    return workRun;
  },

  commitArtifactRun: ({ workRun, agentRun, memoryNotes }) => {
    const current = get();
    set({
      workRuns: [workRun, ...current.workRuns.filter((run) => run.id !== workRun.id)],
      agentRuns: [agentRun, ...current.agentRuns.filter((run) => run.id !== agentRun.id)],
      agentMemoryNotes: [
        ...memoryNotes,
        ...current.agentMemoryNotes.filter((note) => note.runId !== agentRun.id),
      ],
      selectedWorkRunId: workRun.id,
    });
    persistLocal(get());
    return workRun;
  },

  upsertPendingArtifactPlan: (plan) => {
    const current = get();
    const output: AgentDeliveryOutput = {
      id: `delivery-${plan.id}`,
      kind: "plan",
      status: plan.status === "draft" ? "draft" : plan.status,
      title: plan.title,
      detail: "Brief artifact plan",
      sessionId: plan.sessionId,
      projectId: plan.projectId,
      planId: plan.id,
      runId: plan.sourceRunId,
      createdAt: plan.createdAt,
      updatedAt: new Date().toISOString(),
    };
    set({
      pendingArtifactPlans: [
        plan,
        ...current.pendingArtifactPlans.filter((item) => item.id !== plan.id),
      ],
      deliveryOutputs: [
        output,
        ...current.deliveryOutputs.filter((item) => item.id !== output.id),
      ],
    });
    persistLocal(get());
    return plan;
  },

  approvePendingArtifactPlan: (id) => {
    const now = new Date().toISOString();
    const currentPlan = get().pendingArtifactPlans.find((plan) => plan.id === id);
    const approved: PendingArtifactPlan | null = currentPlan
      ? { ...currentPlan, status: "approved", approvedAt: now }
      : null;
    set({
      pendingArtifactPlans: get().pendingArtifactPlans.map((plan) =>
        plan.id === id && approved ? approved : plan,
      ),
      deliveryOutputs: get().deliveryOutputs.map((output) =>
        output.planId === id
          ? { ...output, status: "approved", updatedAt: now }
          : output,
      ),
    });
    if (approved?.sourceBrainRunId) {
      set({
        agentApprovals: get().agentApprovals.map((approval) =>
          approval.runId === approved?.sourceBrainRunId && approval.status === "pending"
            ? { ...approval, status: "approved", resolvedAt: now }
            : approval,
        ),
      });
    }
    persistLocal(get());
    return approved;
  },

  completePendingArtifactPlan: (id, runId) => {
    const now = new Date().toISOString();
    set({
      pendingArtifactPlans: get().pendingArtifactPlans.map((plan) =>
        plan.id === id
          ? { ...plan, status: "completed", completedAt: now, sourceRunId: runId }
          : plan,
      ),
      deliveryOutputs: get().deliveryOutputs.map((output) =>
        output.planId === id
          ? { ...output, status: "completed", runId, updatedAt: now }
          : output,
      ),
    });
    persistLocal(get());
  },

  failPendingArtifactPlan: (id) => {
    const now = new Date().toISOString();
    set({
      pendingArtifactPlans: get().pendingArtifactPlans.map((plan) =>
        plan.id === id ? { ...plan, status: "failed" } : plan,
      ),
      deliveryOutputs: get().deliveryOutputs.map((output) =>
        output.planId === id ? { ...output, status: "failed", updatedAt: now } : output,
      ),
    });
    persistLocal(get());
  },

  dismissPendingArtifactPlan: (id) => {
    const now = new Date().toISOString();
    set({
      pendingArtifactPlans: get().pendingArtifactPlans.map((plan) =>
        plan.id === id ? { ...plan, status: "dismissed" } : plan,
      ),
      deliveryOutputs: get().deliveryOutputs.map((output) =>
        output.planId === id ? { ...output, status: "completed", updatedAt: now } : output,
      ),
    });
    persistLocal(get());
  },

  createArtifactRunFromPromptStream: async (prompt, projectId, onEvent) => {
    const state = get();
    const targetProjectId = projectId ?? state.projects[0]?.id ?? "proj-1";
    const stageHistory: ArtifactDeliveryStage[] = [];
    const forwardEvent = (event: ArtifactStreamEvent, status: ArtifactDeliveryStage["status"] = "complete") => {
      stageHistory.push(stageFromEvent(event, status));
      onEvent?.(event);
    };
    forwardEvent({
      event: "plan_locked",
      at: new Date().toISOString(),
      data: {
        label: "Planning locked",
        detail: "Approved plan is locked and production can start.",
      },
    });
    const context = buildRunContext(targetProjectId, state);
    const { workRun, agentRun, memoryNotes } = runBusinessIntelligenceAgent({
      prompt,
      ...context,
      datasets: state.datasets.filter(
        (dataset) => dataset.projectId === targetProjectId && !dataset.worktreeId,
      ),
    });
    forwardEvent({
      event: "evidence_inspected",
      at: new Date().toISOString(),
      data: {
        label: "Evidence inspected",
        detail: `${workRun.evidence.length} evidence groups and ${agentRun.toolInvocations.length} tool traces are available for the artifact.`,
        model: agentRun.model,
      },
    });

    const brief = await streamBriefWithLocalModel({ workRun, agentRun, onEvent: forwardEvent });
    const emitHtmlStage = (event: ArtifactStreamEvent["event"], label: string, detail: string) => {
      forwardEvent({
        event,
        at: new Date().toISOString(),
        data: { label, detail, model: agentRun.model },
      });
    };
    emitHtmlStage(
      "narrative_drafted",
      "Narrative drafted",
      brief.used
        ? "Model-written narrative has been merged into the deterministic evidence structure."
        : "Using deterministic fallback narrative because the configured model did not return a usable brief.",
    );
    const generated = applyLocalModelBrief({ workRun, agentRun, brief });
    const generatedDraft = generated.workRun.drafts[generated.workRun.drafts.length - 1];
    emitHtmlStage(
      "design_applied",
      "Design applied",
      `Applied the ${generatedDraft?.designTemplate?.replace(/_/g, " ") ?? "selected"} brief template and standalone HTML styling.`,
    );
    emitHtmlStage(
      "claims_audited",
      "Claims audited",
      `Audit score is ${generated.workRun.audit.score}/100 with ${generated.workRun.audit.failedChecks.length} failed checks.`,
    );
    emitHtmlStage(
      "html_rendered",
      "HTML rendered",
      `${generatedDraft?.htmlArtifact?.visualizationCount ?? 0} visual blocks and ${generatedDraft?.htmlArtifact?.tableCount ?? 0} tables were embedded in the HTML file.`,
    );
    emitHtmlStage(
      "html_evidence_attached",
      "Evidence attached",
      `${generatedDraft?.htmlArtifact?.evidenceCount ?? generated.workRun.evidence.length} evidence sources and source URLs were added to the appendix.`,
    );
    emitHtmlStage(
      "export_ready",
      "Export ready",
      generatedDraft?.htmlArtifact?.fileName
        ? `Final artifact file: ${generatedDraft.htmlArtifact.fileName}.`
        : "Final artifact file is ready.",
    );
    const stagedWorkRun = attachDeliveryStagesToLatestDraft({
      workRun: generated.workRun,
      stages: stageHistory,
    });
    return get().commitArtifactRun({
      workRun: stagedWorkRun,
      agentRun: generated.agentRun,
      memoryNotes,
    });
  },

  selectWorkRun: (selectedWorkRunId) => {
    set({ selectedWorkRunId });
    persistLocal(get());
  },

  setWorkRunPhase: (id, phase) => {
    set({
      workRuns: get().workRuns.map((run) =>
        run.id === id ? updateRunPhase(run, phase) : run,
      ),
    });
    persistLocal(get());
  },

  advanceWorkRun: (id) => {
    set({
      workRuns: get().workRuns.map((run) =>
        run.id === id ? updateRunPhase(run, nextLoopPhase(run.phase)) : run,
      ),
    });
    persistLocal(get());
  },

  approveWorkRunPlan: (id) => {
    set({
      workRuns: get().workRuns.map((run) =>
        run.id === id ? approvePlan(run) : run,
      ),
    });
    persistLocal(get());
  },

  createDraftForRun: (id) => {
    set({
      workRuns: get().workRuns.map((run) =>
        run.id === id ? createNextDraft(run) : run,
      ),
    });
    persistLocal(get());
  },

  rerunWorkRunAudit: (id) => {
    set({
      workRuns: get().workRuns.map((run) =>
        run.id === id
          ? { ...run, audit: auditWorkRun(run), phase: "audit", status: "ready" }
          : run,
      ),
    });
    persistLocal(get());
  },

  createActionProposalForRun: (runId) => {
    const state = get();
    const run = state.workRuns.find((item) => item.id === runId);
    if (!run || !run.plan.approved || !run.audit.publishReady) return null;

    const existing = state.actionProposals.find(
      (proposal) => proposal.runId === runId && proposal.status !== "rejected",
    );
    if (existing) return existing;

    const proposal = createAgentActionProposal({
      run,
      teamMembers: state.teamMembers.filter((member) => member.projectId === run.projectId),
    });
    set({ actionProposals: [proposal, ...state.actionProposals] });
    persistLocal(get());
    return proposal;
  },

  approveActionProposal: (proposalId) => {
    set({
      actionProposals: get().actionProposals.map((proposal) =>
        proposal.id === proposalId
          ? { ...proposal, status: "approved", updatedAt: new Date().toISOString() }
          : proposal,
      ),
    });
    persistLocal(get());
  },

  rejectActionProposal: (proposalId) => {
    set({
      actionProposals: get().actionProposals.map((proposal) =>
        proposal.id === proposalId
          ? { ...proposal, status: "rejected", updatedAt: new Date().toISOString() }
          : proposal,
      ),
    });
    persistLocal(get());
  },

  applyActionProposal: (proposalId) => {
    const state = get();
    const proposal = state.actionProposals.find((item) => item.id === proposalId);
    if (!proposal || proposal.status === "applied") return;
    const run = state.workRuns.find((item) => item.id === proposal.runId);
    if (!run) return;

    const now = new Date().toISOString();
    const nextTasks = [...state.tasks];
    const createdTasks = proposal.proposedTasks.map((proposed) => {
      const task: Task = {
        id: generateId("task"),
        projectId: proposal.projectId,
        identifier: generateIdentifier(proposal.projectId, nextTasks),
        title: proposed.title,
        status: proposed.status,
        description: proposed.description,
        assignee: proposed.unresolvedOwner ? undefined : proposed.suggestedAssignee,
        priority: proposed.priority,
        dueDate: proposed.dueDate,
        sourceRunId: proposed.sourceRunId,
        sourceDraftId: proposed.sourceDraftId,
        sourceFinding: proposed.sourceFinding,
        createdAt: now,
        updatedAt: now,
      };
      nextTasks.push(task);
      return task;
    });

    const linkedRoadmap = createRoadmapItemsFromRun(run).map((item, index) => ({
      ...item,
      linkedTaskIds: createdTasks.slice(index, index + 1).map((task) => task.id),
      owner: createdTasks[index]?.assignee,
    }));

    set({
      tasks: nextTasks,
      actionProposals: state.actionProposals.map((item) =>
        item.id === proposalId ? { ...item, status: "applied", updatedAt: now } : item,
      ),
      roadmapItems: [...linkedRoadmap, ...state.roadmapItems],
      taskActivities: [
        ...createdTasks.flatMap((task) => [
          {
            id: generateId("activity"),
            projectId: task.projectId,
            taskId: task.id,
            runId: task.sourceRunId,
            type: "brief_task_applied" as const,
            title: `${task.identifier} applied from brief`,
            description: task.title,
            actor: "Agent" as const,
            createdAt: now,
          },
          {
            id: generateId("activity"),
            projectId: task.projectId,
            taskId: task.id,
            runId: task.sourceRunId,
            type: "task_created" as const,
            title: `${task.identifier} created`,
            description: `${task.title}${task.assignee ? ` assigned to ${task.assignee}` : ""}.`,
            actor: "Agent" as const,
            createdAt: now,
          },
        ]),
        ...linkedRoadmap.map((item) => ({
          id: generateId("activity"),
          projectId: item.projectId,
          runId: item.runId,
          type: "roadmap_item_linked" as const,
          title: `${item.title} added to roadmap`,
          description: item.description,
          actor: "Agent" as const,
          createdAt: now,
        })),
        ...state.taskActivities,
      ],
    });
    persistLocal(get());
  },

  getTasksByProject: (projectId) =>
    canonicalTasksForProject(get().tasks, projectId),

  getContactsByProject: (projectId) =>
    enrichContacts(get().contacts.filter((c) => c.projectId === projectId)),

  getTeamMembersByProject: (projectId) =>
    get()
      .teamMembers.filter((m) => m.projectId === projectId)
      .map(enrichTeamMember),

  getTeamMembersByWorkspace: (workspaceId) => {
    const projectIds = new Set(
      get()
        .projects.filter((project) => project.workspaceId === workspaceId)
        .map((project) => project.id),
    );
    return get()
      .teamMembers.filter((member) => projectIds.has(member.projectId))
      .map(enrichTeamMember);
  },

  getDatasetsByProject: (projectId) =>
    get().datasets.filter((dataset) => dataset.projectId === projectId && !dataset.worktreeId),

  getMessagesBySession: (sessionId) =>
    get().messages.filter((m) => m.sessionId === sessionId),

  getBrainRunsByProject: (projectId) =>
    get()
      .agentBrainRuns.filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  getAgentMemoriesByProject: (projectId) =>
    get()
      .agentMemories.filter((memory) => memory.projectId === projectId)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)),

  getPermissionGrantsByProject: (projectId) =>
    get().permissionGrants.filter((grant) => grant.projectId === projectId),

  getGatewayMessagesByProject: (projectId) =>
    get()
      .gatewayMessages.filter((message) => message.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
}));

function persistLocal(state: DataState) {
  const payload = {
    artifactSchemaVersion: state.artifactSchemaVersion,
    workspaces: state.workspaces,
    workspaceMembers: state.workspaceMembers,
    projects: state.projects,
    tasks: state.tasks,
    contacts: state.contacts,
    sessions: state.sessions,
    messages: state.messages,
    researchDocs: state.researchDocs,
    teamMembers: state.teamMembers,
    teamMessages: state.teamMessages,
    datasets: state.datasets,
    agentRuns: state.agentRuns,
    agentMemoryNotes: state.agentMemoryNotes,
    agentBrainRuns: state.agentBrainRuns,
    agentBrainSteps: state.agentBrainSteps,
    agentBrainToolCalls: state.agentBrainToolCalls,
    agentObservations: state.agentObservations,
    agentApprovals: state.agentApprovals,
    agentContextPacks: state.agentContextPacks,
    agentMemories: state.agentMemories,
    permissionGrants: state.permissionGrants,
    gatewayMessages: state.gatewayMessages,
    workRuns: state.workRuns,
    pendingArtifactPlans: state.pendingArtifactPlans,
    deliveryOutputs: state.deliveryOutputs,
    actionProposals: state.actionProposals,
    taskActivities: state.taskActivities,
    roadmapItems: state.roadmapItems,
    plans: state.plans,
    insights: state.insights,
    worktrees: state.worktrees,
    headVersions: state.headVersions,
    activeHeadVersionByTeam: state.activeHeadVersionByTeam,
    automations: state.automations,
    scheduleEntries: state.scheduleEntries,
    workspaceFiles: state.workspaceFiles,
    workspaceEvents: state.workspaceEvents,
    notifications: state.notifications,
    selectedWorkRunId: state.selectedWorkRunId,
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("crm-data", JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to write localStorage backup:", err);
    }
  }

  void saveBrowserData(payload).catch((err) => {
    console.warn("Failed to persist browser database state:", err);
  });
}
