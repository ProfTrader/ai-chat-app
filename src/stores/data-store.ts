import { create } from "zustand";
import type {
  AgentActionProposal,
  AgentDomainId,
  AgentMemoryNote,
  AgentRun,
  Contact,
  DatasetSemanticRole,
  Message,
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
  applyLocalModelBrief,
  generateBriefWithLocalModel,
  streamBriefWithLocalModel,
  type ArtifactStreamEvent,
} from "@/lib/agents/client";
import {
  mockContacts,
  mockMessages,
  mockProjects,
  mockSessions,
  mockTasks,
  mockTeamMembers,
  mockWorkspaces,
} from "@/lib/mock-data";
import { enrichContacts, enrichTeamMember } from "@/lib/person-profiles";

interface DataState {
  artifactSchemaVersion: number;
  initialized: boolean;
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
  workRuns: WorkRun[];
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
  addProject: (name: string, workspaceId: string) => Promise<Project>;
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
}

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

function seedTaskActivities(): TaskActivity[] {
  return mockTasks.slice(0, 5).map((task, index) => ({
    id: generateId("activity"),
    projectId: task.projectId,
    taskId: task.id,
    type: task.status === "done" ? "status_changed" : "task_created",
    title: task.status === "done" ? `${task.identifier} completed` : `${task.identifier} created`,
    description:
      task.status === "done"
        ? `${task.title} moved to done.`
        : `${task.title} is on the project board.`,
    actor: index % 2 === 0 ? "System" : "User",
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
  }));
}

const seedTaskActivityItems = seedTaskActivities();
const seedRoadmapItems: RoadmapItem[] = [];
const ARTIFACT_SCHEMA_VERSION = 2;

export const useDataStore = create<DataState>((set, get) => ({
  artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
  initialized: false,
  workspaces: mockWorkspaces,
  projects: mockProjects,
  tasks: mockTasks,
  contacts: mockContacts,
  sessions: mockSessions,
  messages: mockMessages,
  teamMembers: mockTeamMembers,
  datasets: [],
  agentRuns: [],
  agentMemoryNotes: [],
  workRuns: [],
  actionProposals: [],
  taskActivities: seedTaskActivityItems,
  roadmapItems: seedRoadmapItems,
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
          set({ ...data, initialized: true });
          return;
        }
        const { seedDatabase } = await import("@/lib/db");
        await seedDatabase();
        const seeded = await loadAllData();
        set({ ...seeded, initialized: true });
        return;
      } catch (err) {
        console.warn("SQLite unavailable, using in-memory data:", err);
      }
    }

    const stored = localStorage.getItem("crm-data");
    if (stored) {
      try {
        const data = JSON.parse(stored) as Partial<DataState>;
        const resetArtifacts = data.artifactSchemaVersion !== ARTIFACT_SCHEMA_VERSION;
        const storedRuns =
          !resetArtifacts && Array.isArray(data.workRuns) && data.workRuns.every(hasCurrentRunShape)
            ? data.workRuns
            : [];
        set({
          artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
          workspaces: data.workspaces ?? mockWorkspaces,
          projects: data.projects ?? mockProjects,
          tasks: data.tasks ?? mockTasks,
          contacts: enrichContacts(data.contacts ?? mockContacts),
          sessions: data.sessions ?? mockSessions,
          messages: data.messages ?? mockMessages,
          teamMembers: mockTeamMembers,
          datasets:
            Array.isArray(data.datasets) && data.datasets.every(hasDatasetShape)
              ? data.datasets
              : [],
          agentRuns: !resetArtifacts && Array.isArray(data.agentRuns) ? data.agentRuns : [],
          agentMemoryNotes: !resetArtifacts && Array.isArray(data.agentMemoryNotes) ? data.agentMemoryNotes : [],
          workRuns: storedRuns,
          actionProposals: !resetArtifacts ? data.actionProposals ?? [] : [],
          taskActivities: data.taskActivities ?? seedTaskActivityItems,
          roadmapItems: !resetArtifacts ? data.roadmapItems ?? seedRoadmapItems : seedRoadmapItems,
          selectedWorkRunId: storedRuns.some((run) => run.id === data.selectedWorkRunId)
            ? data.selectedWorkRunId!
            : storedRuns[0]?.id ?? null,
          initialized: true,
        });
        persistLocal(get());
        return;
      } catch {
        // fall through
      }
    }

    set({ initialized: true });
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

  addProject: async (name, workspaceId) => {
    const project: Project = {
      id: generateId("proj"),
      workspaceId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
    };
    set({ projects: [...get().projects, project] });
    persistLocal(get());
    return project;
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

  createArtifactRunFromPromptStream: async (prompt, projectId, onEvent) => {
    const state = get();
    const targetProjectId = projectId ?? state.projects[0]?.id ?? "proj-1";
    const context = buildRunContext(targetProjectId, state);
    const { workRun, agentRun, memoryNotes } = runBusinessIntelligenceAgent({
      prompt,
      ...context,
      datasets: state.datasets.filter((dataset) => dataset.projectId === targetProjectId),
    });

    const brief = await streamBriefWithLocalModel({ workRun, agentRun, onEvent });
    const emitHtmlStage = (event: ArtifactStreamEvent["event"], label: string, detail: string) => {
      onEvent?.({
        event,
        at: new Date().toISOString(),
        data: { label, detail, model: agentRun.model },
      });
    };
    emitHtmlStage(
      "html_scaffolded",
      "HTML scaffold",
      "Creating the standalone document shell, layout, and responsive report structure.",
    );
    emitHtmlStage(
      "html_design_applied",
      "Tradeify design applied",
      "Applying design.md, the official Tradeify logo treatment, dark report surfaces, and green/gold data accents.",
    );
    const generated = applyLocalModelBrief({ workRun, agentRun, brief });
    const generatedDraft = generated.workRun.drafts[generated.workRun.drafts.length - 1];
    emitHtmlStage(
      "html_visuals_rendered",
      "Visual blocks rendered",
      `${generatedDraft?.htmlArtifact?.visualizationCount ?? 0} visual blocks and ${generatedDraft?.htmlArtifact?.tableCount ?? 0} tables were embedded in the HTML file.`,
    );
    emitHtmlStage(
      "html_evidence_attached",
      "Evidence appendix attached",
      `${generatedDraft?.htmlArtifact?.evidenceCount ?? generated.workRun.evidence.length} evidence sources and source URLs were added to the appendix.`,
    );
    emitHtmlStage(
      "html_finalized",
      "HTML file finalized",
      generatedDraft?.htmlArtifact?.fileName
        ? `Final artifact file: ${generatedDraft.htmlArtifact.fileName}.`
        : "Final artifact file is ready.",
    );
    return get().commitArtifactRun({
      workRun: generated.workRun,
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
    datasets: state.datasets,
    agentRuns: state.agentRuns,
    agentMemoryNotes: state.agentMemoryNotes,
    workRuns: state.workRuns,
    actionProposals: state.actionProposals,
    taskActivities: state.taskActivities,
    roadmapItems: state.roadmapItems,
    selectedWorkRunId: state.selectedWorkRunId,
  };
  localStorage.setItem("crm-data", JSON.stringify(payload));
}
