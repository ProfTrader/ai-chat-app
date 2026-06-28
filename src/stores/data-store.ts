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
  RoadmapItem,
  Session,
  Task,
  TaskActivity,
  TaskStatus,
  TeamMember,
  WorkLoopPhase,
  WorkRun,
  Workspace,
} from "@/types";
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
  projects: Project[];
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
  teamMembers: TeamMember[];
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
  addSession: (projectId: string, title?: string) => Promise<Session>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
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
  projects?: Project[];
  tasks?: Task[];
  contacts?: Contact[];
  sessions?: Session[];
  messages?: Message[];
  teamMembers?: TeamMember[];
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
    tasks: state.tasks.filter((task) => task.projectId === projectId),
    contacts: state.contacts.filter((contact) => contact.projectId === projectId),
    sessions,
    messages: state.messages.filter((message) => sessionIds.has(message.sessionId)),
  };
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
const ARTIFACT_SCHEMA_VERSION = 8;

/** Predefined team workspaces — a ready-made template, not mock data. */
const TEAM_PROJECTS: Project[] = [
  { id: "proj-risk", workspaceId: "ws-1", name: "Risk Team", slug: "risk" },
  { id: "proj-marketing", workspaceId: "ws-1", name: "Marketing Team", slug: "marketing" },
  { id: "proj-operations", workspaceId: "ws-1", name: "Operations Team", slug: "operations" },
  { id: "proj-sales", workspaceId: "ws-1", name: "Sales Team", slug: "sales" },
  { id: "proj-product", workspaceId: "ws-1", name: "Product Team", slug: "product" },
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

function defaultProjects(): Project[] {
  return TEAM_PROJECTS.map((project) => ({ ...project }));
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
        const stored = data.projects ?? [];
        const ids = new Set(stored.map((project) => project.id));
        const merged = [...stored, ...TEAM_PROJECTS.filter((team) => !ids.has(team.id))];
        return merged.length > 0 ? merged : defaultProjects();
      })();
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
    workspaces: resetMock ? defaultWorkspaces() : data.workspaces ?? defaultWorkspaces(),
    projects,
    tasks: resetMock ? [] : data.tasks ?? [],
    contacts: enrichContacts(resetMock ? [] : data.contacts ?? []),
    sessions: (shouldDropSeededChatHistory ? [] : data.sessions ?? []).filter((session) =>
      validProjectIds.has(session.projectId),
    ),
    messages: shouldDropSeededChatHistory ? [] : data.messages ?? [],
    teamMembers: (resetMock ? [] : data.teamMembers ?? []).map(enrichTeamMember),
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
  projects: defaultProjects(),
  tasks: [],
  contacts: [],
  sessions: [],
  messages: [],
  teamMembers: [],
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
  notifications: [],
  selectedWorkRunId: null,

  initialize: async () => {
    if (get().initialized) return;

    const tauri = await isTauriRuntime();
    if (tauri) {
      try {
        const { initDatabase, loadAllData } = await import("@/lib/db");
        await initDatabase();
        const data = await loadAllData();
        if (data.tasks.length > 0) {
          set({ ...data, storageBackend: "sqlite", initialized: true });
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
      tasks: state.tasks.filter((task) => task.projectId === projectId),
      datasets: state.datasets.filter((dataset) => dataset.projectId === projectId),
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
      sender: input.sender || channelLabel,
      text: input.text,
      status: "received",
      createdAt: new Date().toISOString(),
    };
    set({ gatewayMessages: [message, ...get().gatewayMessages] });
    persistLocal(get());
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
      datasets: state.datasets.filter((dataset) => dataset.projectId === targetProjectId),
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
      datasets: state.datasets.filter((dataset) => dataset.projectId === targetProjectId),
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
    get().tasks.filter((t) => t.projectId === projectId),

  getContactsByProject: (projectId) =>
    enrichContacts(get().contacts.filter((c) => c.projectId === projectId)),

  getTeamMembersByProject: (projectId) =>
    get()
      .teamMembers.filter((m) => m.projectId === projectId)
      .map(enrichTeamMember),

  getDatasetsByProject: (projectId) =>
    get().datasets.filter((dataset) => dataset.projectId === projectId),

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
    projects: state.projects,
    tasks: state.tasks,
    contacts: state.contacts,
    sessions: state.sessions,
    messages: state.messages,
    teamMembers: state.teamMembers,
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
