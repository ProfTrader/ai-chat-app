import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { useDataStore } from "@/stores/data-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { draftEmail as draftEmailApi, encodeEmailMarker } from "@/lib/email/client";
import { proposeTasks as proposeTasksApi, encodeTasksMarker } from "@/lib/tasks/client";
import { appendAgentNote } from "@/lib/agent-files/client";
import {
  encodeDocMarker,
  encodeDeliveryMarker,
  buildPremiseMarkdown,
  slugifyFilename,
} from "@/lib/docs/client";
import { stripNexusMarkers } from "@/lib/chat/attachments";
import { getReaction } from "@/lib/chat/reactions";
import {
  encodePlanMarker,
  extractChoicesFromMessage,
  parseChipsMarker,
  parsePlanReadyMarker,
  requestPlan,
  requestPlanIntake,
  stripPlanMarkers,
  type PlanIntakeDraft,
} from "@/lib/plan/client";
import {
  encodeAutomationMarker,
  encodeDeliverablesMarker,
  encodeScheduleMarker,
} from "@/lib/automation/client";
import type {
  AgentBrainStage,
  ComposerMode,
  Contact,
  Message,
  PendingArtifactPlan,
  ProjectDataset,
  Task,
  TeamMember,
} from "@/types";

function messageToUi(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

function uiMessageToText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function shouldRouteToBrief(_text: string, _previousMessages: Message[]) {
  // Deterministic brief auto-planning is disabled: "create a plan / brief"
  // requests now go to the real LLM, which asks grounded clarifying questions
  // (using the firm profile) instead of emitting a predetermined plan with mock
  // datasets. Briefs can be reintroduced later as a model-driven flow.
  return false;
}

function isBriefApproval(text: string) {
  return /\b(approve|approved|proceed|go ahead|create it|generate it|build it|make it|start production|run it)\b/i.test(
    text,
  );
}

function shouldRouteToTasks(text: string) {
  const input = text.toLowerCase();
  const createVerb =
    /\b(create|add|make|set up|generate|spin up|break down|break (?:this|it|that) (?:down |up )?into|turn (?:this|it|that) into|draft|plan out|list)\b/.test(
      input,
    );
  const taskNoun =
    /\b(tasks?|to-?dos?|action items?|tickets?|checklist|board cards?|sub-?tasks?)\b/.test(input);
  return createVerb && taskNoun;
}

// Planning/build requests go through an interactive multiple-choice intake first.
function shouldClarify(text: string) {
  const input = text.toLowerCase();
  const buildVerb =
    /\b(create|draft|build|make|plan|design|put together|prepare|develop|launch|set up|write|outline|map out)\b/.test(
      input,
    );
  const deliverable =
    /\b(plan|brief|strategy|campaign|roadmap|launch|proposal|project|go-to-market|gtm|playbook|initiative|program|workflow|onboarding flow|funnel)\b/.test(
      input,
    );
  return buildVerb && deliverable;
}

function planCardQuestion(text: string) {
  const lines = stripPlanMarkers(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const questionLine = lines.find((line) => line.includes("?"));
  if (!questionLine) return lines.join("\n");

  const shortQuestion = questionLine.match(/(?:\*\*)?\s*Q\d+\s*[.:]\s*(?:\*\*)?\s*([^?]*\?)/i);
  if (shortQuestion?.[1]) return shortQuestion[1].trim();

  const numberedQuestion = questionLine.match(
    /(?:\*\*)?Question\s+\d+\s+of\s+~?\d+\s*:?(?:\*\*)?\s*([^?]*\?)/i,
  );
  if (numberedQuestion?.[1]) return numberedQuestion[1].trim();

  const questionSentence = questionLine.match(/[^.?!]*\?/);
  return (questionSentence?.[0] ?? questionLine)
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^Question\s+\d+\s+of\s+~?\d+\s*:\s*/i, "")
    .trim();
}

function bestPlanChoices(markerChips: string[], proseChoices: string[]) {
  const source = proseChoices.length > 0 ? proseChoices : markerChips;
  return source.filter(
    (choice, index) =>
      choice.trim().length > 0 &&
      source.findIndex((candidate) => candidate.toLowerCase() === choice.toLowerCase()) === index,
  );
}

function extractPlanQuestionProgress(text: string) {
  const match = stripPlanMarkers(text).match(/Question\s+(\d+)\s+of\s+~?(\d+)/i);
  if (!match) return null;
  const current = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) return null;
  return {
    current: Math.min(total, Math.max(1, current)),
    total,
  };
}

function planCardProgress(text: string, fallbackCurrent: number) {
  const progress = extractPlanQuestionProgress(text);
  const blockCount = planQuestionBlockCount(text);
  if (!progress && blockCount > 1) {
    return {
      current: 1,
      total: blockCount,
    };
  }
  if (!progress) {
    return {
      current: Math.min(4, Math.max(1, fallbackCurrent)),
      total: 4,
    };
  }
  return progress;
}

function planScopedMessages(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user" && shouldClarify(stripNexusMarkers(message.content))) {
      return messages.slice(i);
    }
  }
  return messages;
}

function planQuestionCount(messages: Message[]) {
  return planScopedMessages(messages).filter((message) => {
    if (message.role !== "assistant") return false;
    if (message.content.includes("[[nexus:plan:") || message.content.includes("[[nexus:plan-ready]]")) {
      return false;
    }
    return planCardQuestion(message.content).includes("?");
  }).length;
}

function planQuestionBlockCount(text: string) {
  const matches = stripPlanMarkers(text).match(/(?:^|\n)\s*(?:\*\*)?\s*(?:Q\d+|Question\s+\d+)\b[\s\S]*?\?/gi);
  return matches?.length ?? 0;
}

function answerCoversMultiplePlanQuestions(answer: string) {
  const clean = stripNexusMarkers(answer);
  const selectedLetters = new Set(clean.match(/\b[A-D]\b/gi)?.map((letter) => letter.toUpperCase()) ?? []);
  return selectedLetters.size >= 2 || (/\b(and|plus|with)\b|[,;\n]/i.test(clean) && clean.length > 24);
}

function shouldFinalizePlanIntakeAfterAnswer(previousMessages: Message[], answer: string) {
  const scoped = planScopedMessages(previousMessages);
  const latestAssistant = [...scoped].reverse().find((message) => message.role === "assistant");
  if (!latestAssistant) return false;
  if (
    latestAssistant.content.includes("[[nexus:plan:") ||
    latestAssistant.content.includes("[[nexus:plan-ready]]")
  ) {
    return false;
  }
  if (!planCardQuestion(latestAssistant.content).includes("?")) return false;

  const progress = extractPlanQuestionProgress(latestAssistant.content);
  if (progress && progress.current >= progress.total) return true;
  if (planQuestionBlockCount(latestAssistant.content) >= 2) {
    return answerCoversMultiplePlanQuestions(answer);
  }
  return planQuestionCount(previousMessages) >= 3;
}

interface FallbackPlanQuestion {
  question: string;
  choices: string[];
}

function fallbackPlanQuestions(request: string): FallbackPlanQuestion[] {
  const input = request.toLowerCase();
  if (/\b(onboard|implementation|customer|client|dashboard|security|legal|data)\b/.test(input)) {
    return [
      {
        question: "What risk should the onboarding plan reduce first?",
        choices: [
          "Messy data blocking dashboard accuracy",
          "Security/legal review delaying launch",
          "Executive dashboard due within 30 days",
          "Customer adoption after the first dashboard",
        ],
      },
      {
        question: "Who should be the primary acceptance owner for the first dashboard?",
        choices: [
          "VP of Sales",
          "Customer admin or data owner",
          "Security/legal approver",
          "Joint implementation lead",
        ],
      },
      {
        question: "Which readiness area is weakest right now?",
        choices: [
          "Source data access and cleanup",
          "Dashboard requirements",
          "Security documentation",
          "Stakeholder alignment",
        ],
      },
    ];
  }
  if (/\b(hir|recruit|candidate|interview|role)\b/.test(input)) {
    return [
      {
        question: "What should the hiring plan optimize for first?",
        choices: ["Speed to offer", "High-quality signal", "Candidate experience", "Team alignment"],
      },
      {
        question: "Which role capability is non-negotiable?",
        choices: ["Craft quality", "Systems thinking", "Domain experience", "Leadership potential"],
      },
      {
        question: "How structured should the interview loop be?",
        choices: ["Lightweight", "Standardized scorecard", "Work-sample heavy", "Panel-driven"],
      },
    ];
  }
  if (/\b(bug|qa|release|test|regression|rollback)\b/.test(input)) {
    return [
      {
        question: "What release risk should the plan reduce first?",
        choices: ["Critical regressions", "Customer-facing workflows", "Data integrity", "Rollback readiness"],
      },
      {
        question: "How strict should the release criteria be?",
        choices: ["Block only severe issues", "Block high-priority defects", "Require full regression pass", "Require stakeholder signoff"],
      },
      {
        question: "Which area needs the deepest coverage?",
        choices: ["Core product flows", "Integrations", "Permissions/security", "Reporting/analytics"],
      },
    ];
  }
  return [
    {
      question: "What outcome should this plan optimize for first?",
      choices: ["Speed", "Quality", "Risk reduction", "Stakeholder confidence"],
    },
    {
      question: "Which constraint should shape the plan most?",
      choices: ["Timeline", "Team capacity", "Budget", "Approval risk"],
    },
    {
      question: "What should require explicit approval before execution?",
      choices: ["External communications", "Security-sensitive work", "Spend or vendor decisions", "Final deliverables"],
    },
  ];
}

function buildFallbackPlanQuestion(index: number, request: string) {
  const questions = fallbackPlanQuestions(request);
  const item = questions[index];
  if (!item) return null;
  const visibleChoices = item.choices
    .map((choice, choiceIndex) => `${String.fromCharCode(65 + choiceIndex)}. ${choice}`)
    .join("\n");
  return [
    `Question ${index + 1} of ${questions.length}: ${item.question}`,
    "",
    visibleChoices,
    "",
    `[[nexus:chips]]${JSON.stringify(item.choices)}[[/nexus:chips]]`,
  ].join("\n");
}

function fallbackPlanQuestionIndex(messages: Message[]) {
  const latestAssistant = [...planScopedMessages(messages)]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!latestAssistant) return null;
  if (
    latestAssistant.content.includes("[[nexus:plan:") ||
    latestAssistant.content.includes("[[nexus:plan-ready]]")
  ) {
    return null;
  }
  const progress = extractPlanQuestionProgress(latestAssistant.content);
  if (!progress || progress.total < 1 || progress.total > 4) return null;
  return progress.current - 1;
}

function latestAssistantNeedsPlanAnswer(messages: Message[]) {
  const latestAssistant = [...planScopedMessages(messages)]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!latestAssistant) return false;
  if (
    latestAssistant.content.includes("[[nexus:plan:") ||
    latestAssistant.content.includes("[[nexus:plan-ready]]")
  ) {
    return false;
  }
  return planCardQuestion(latestAssistant.content).includes("?");
}

function buildPlanIntakeSummary(messages: Message[]) {
  const pairs: Array<{ question: string; answer: string }> = [];
  let pendingQuestion: string | null = null;

  for (const message of planScopedMessages(messages)) {
    if (message.role === "assistant") {
      const question = planCardQuestion(message.content);
      pendingQuestion = question.includes("?") ? question : null;
      continue;
    }
    if (message.role === "user" && pendingQuestion) {
      const answer = stripNexusMarkers(message.content).trim();
      if (answer) pairs.push({ question: pendingQuestion, answer });
      pendingQuestion = null;
    }
  }

  const bullets = pairs.slice(-5).map((pair) => `- ${pair.question} ${pair.answer}`);
  return [
    "I have enough to draft the plan.",
    "",
    "Intake summary:",
    ...(bullets.length ? bullets : ["- I will use the plan details from this conversation."]),
    "",
    "Generating the editable plan now.",
    "",
    "[[nexus:plan-ready]]",
  ].join("\n");
}

function previousPlanQuestions(messages: Message[]) {
  return planScopedMessages(messages)
    .filter((message) => message.role === "assistant")
    .filter((message) => !messageHasPlanArtifact(message.content))
    .map((message) => planCardQuestion(message.content))
    .filter((question) => question.includes("?") && !messageHasPlanArtifact(question))
    .slice(-6);
}

function messageHasPlanArtifact(text: string) {
  return text.includes("[[nexus:plan:") || text.includes("[[nexus:plan-ready]]");
}

function formatPlanIntakeMessage(intake: PlanIntakeDraft, questionCount: number) {
  const question = intake.question.trim() || "I have enough context to draft the editable plan now.";
  if (intake.ready) {
    return [question, "", "[[nexus:plan-ready]]"].join("\n");
  }

  const chips = intake.chips.map((chip) => chip.trim()).filter(Boolean).slice(0, 4);
  const visibleChoices = chips
    .map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`)
    .join("\n");

  return [
    `Question ${Math.min(questionCount + 1, 4)} of ~4: ${question}`,
    visibleChoices ? `\n${visibleChoices}` : "",
    chips.length ? `\n[[nexus:chips]]${JSON.stringify(chips)}[[/nexus:chips]]` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "brief-plan";
}

function buildBriefPrompt(text: string, previousMessages: Message[], projectName?: string) {
  const recentUserContext = previousMessages
    .slice(-8)
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => `- ${message.content}`)
    .join("\n\n");

  if (!recentUserContext) return text;

  return `Create a structured brief for ${projectName ?? "the selected project"} using the latest request and recent user intent.

Latest request:
${text}

Recent user intent:
${recentUserContext}

Do not ask clarifying questions. Use available workspace evidence, cite what is known, and mark missing information as evidence gaps or assumptions.`;
}

function buildBriefPlanMarkdown({
  userRequest,
  projectName,
}: {
  userRequest: string;
  projectName?: string;
}) {
  const planTitle = `${slugify(userRequest)}.md`;
  const needsCompetitiveResearch = /\b(competitor|competitive|market|benchmark|category|dossier|websearch|web search)\b/i.test(userRequest);
  const primaryDataset =
    /\b(prop|trader|funded|evaluation|payout|breach|p&l|pnl)\b/i.test(userRequest)
      ? "Prop firm operating dataset: up to 1000 trading accounts with daily revenue, payouts, breaches, worker overhead, and KPI signals."
      : /\b(bank|banking|kyc|entitlement|churn|complaint|sentiment)\b/i.test(userRequest)
        ? "Banking knowledge packs: account health, KYC/entitlement flags, complaints, and sentiment/news context."
        : "Selected project datasets and public-source knowledge packs in the Briefs data panel.";

  return [
    `# ${planTitle}`,
    "",
    "## Objective",
    `Create an HTML brief artifact for **${projectName ?? "the selected project"}** from the approved request:`,
    "",
    `> ${userRequest}`,
    "",
    "## Primary Data",
    `- ${primaryDataset}`,
    "- Workspace tasks, contacts, recent chat context, and any added knowledge packs will be treated as evidence.",
    "- The model will use database evidence and representative text snippets; charts, tables, and audit checks remain deterministic.",
    "",
    "## Analysis Plan",
    "- Inspect available datasets, typed columns, row counts, source metadata, and missing fields.",
    "- Profile metrics, segment mix, trend movement, and effectiveness/lift where usable exposure fields exist.",
    "- Draft source-backed findings, recommendations, assumptions, and handoff actions.",
    needsCompetitiveResearch
      ? "- If competitive/web research is required, cite supplied/public source URLs in the evidence appendix; do not treat uncited web claims as facts."
      : "- Use only available workspace/database evidence unless the user supplies external sources.",
    "",
    "## HTML Production Plan",
    "- Build the HTML artifact from the model-written narrative plus deterministic KPI, chart, table, evidence, and audit blocks.",
    "- Stream visible production stages in chat: data inspection, model drafting, audit, HTML scaffold, visual blocks, evidence appendix, and final file.",
    "- Save the artifact in Briefs with Preview and HTML download actions.",
    "",
    "## Decision",
    "Use the decision card above the composer to create the brief, revise the scope, or cancel this plan.",
  ].join("\n");
}

function briefPlanTitle(userRequest: string) {
  return `${slugify(userRequest)}.md`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function artifactEventToBrainStage(event: string): AgentBrainStage {
  if (event.includes("evidence")) return "retrieve_context";
  if (event.includes("narrative") || event.includes("design")) return "plan";
  if (event.includes("audit") || event.includes("claims")) return "reflect";
  if (event.includes("export") || event.includes("rendered")) return "deliver";
  if (event.includes("error")) return "observe";
  return "execute_tools";
}

function shouldRememberUserInstruction(text: string) {
  return /\b(remember|prefer|preference|always|use this next time|from now on)\b/i.test(text);
}

function planningStages({
  userRequest,
  tasks,
  datasets,
  contacts,
  teamMembers,
  previousMessages,
}: {
  userRequest: string;
  tasks: Task[];
  datasets: ProjectDataset[];
  contacts: Contact[];
  teamMembers: TeamMember[];
  previousMessages: Message[];
}) {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const highPriority = tasks.filter((task) => task.priority === "high");
  const datasetRows = datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0);
  const recentUserMessages = previousMessages.filter((message) => message.role === "user").slice(-5);
  const supportSignals = [
    ...tasks.filter((task) => /(support|customer|response|ticket|onboard|help)/i.test(`${task.title} ${task.description ?? ""}`)),
    ...tasks.filter((task) => /(block|risk|delay|urgent|priority)/i.test(`${task.title} ${task.description ?? ""}`)),
  ];

  return [
    {
      label: "Understood the request",
      detail: `Framed the ask as a source-backed brief about: "${userRequest}".`,
    },
    {
      label: "Scanned project workspace",
      detail: `${tasks.length} tasks found, ${openTasks.length} still open, ${highPriority.length} high priority.`,
    },
    {
      label: "Inspected database context",
      detail: datasets.length
        ? `${datasets.length} project datasets available with ${datasetRows.toLocaleString()} total rows.`
        : "No imported project datasets yet; using workspace tasks, chat context, team, and contacts.",
    },
    {
      label: "Checked people and conversation signals",
      detail: `${teamMembers.length} teammates, ${contacts.length} contacts, and ${recentUserMessages.length} recent user messages are available for relevance checks.`,
    },
    {
      label: "Ranked relevance",
      detail: supportSignals.length
        ? `${supportSignals.length} support/customer/blocker signals look relevant enough to shape the plan.`
        : "No explicit support dataset found, so the plan marks assumptions and evidence gaps clearly.",
    },
  ];
}

function buildPlanningProgress({
  current,
  completed,
}: {
  current?: string;
  completed: Array<{ label: string; detail: string }>;
}) {
  return [
    "I am preparing the brief plan from the project workspace before asking you to approve anything.",
    "",
    "## Planning run",
    "",
    ...(current ? [`**Current:** ${current}`, ""] : []),
    ...(completed.length
      ? [
          "**Checked:**",
          ...completed.map((stage) => `- **${stage.label}:** ${stage.detail}`),
        ]
      : []),
  ].join("\n");
}

function buildPlanningResult({
  stages,
  markdown,
}: {
  stages: Array<{ label: string; detail: string }>;
  markdown: string;
}) {
  return [
    "I checked the project context first, then prepared a brief plan. Choose the next step from the decision card above the composer.",
    "",
    "## Planning run",
    "",
    ...stages.map((stage) => `- **${stage.label}:** ${stage.detail}`),
    "",
    "## Recommended brief plan",
    "",
    markdown,
  ].join("\n");
}

interface ChatSessionContextValue {
  messages: UIMessage[];
  status: ReturnType<typeof useChat>["status"];
  error: Error | undefined;
  activities: ChatActivity[];
  pendingBriefPlan: PendingArtifactPlan | null;
  planIntake: PlanIntake | null;
  planChips: string[];
  planReady: boolean;
  planBusy: boolean;
  generatePlan: () => Promise<void>;
  buildPlan: (planId: string) => Promise<void>;
  artifactBusy: boolean;
  send: (text: string) => Promise<void>;
  composeEmail: (instruction: string) => Promise<void>;
  proposeTasks: (instruction: string) => Promise<void>;
  submitClarifyAnswers: (request: string, answers: string) => Promise<void>;
  submitDeliveryChoice: (
    request: string,
    premise: string,
    choices: string[],
    note: string,
  ) => Promise<void>;
  decidePendingBriefPlan: (decision: "create" | "dismiss") => Promise<void>;
  reactToMessage: (message: UIMessage, emoji: string) => void;
  stop: () => void;
}

export interface ChatActivity {
  id: string;
  status: "running" | "complete" | "error";
  label: string;
  detail: string;
  toolName: string;
  provider?: string;
  model?: string;
}

interface PlanIntake {
  question: string;
  chips: string[];
  ready: boolean;
  progress: {
    current: number;
    total: number;
  };
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

function normalizeActivity(part: { id?: string; data?: unknown }): ChatActivity {
  const data =
    part.data && typeof part.data === "object"
      ? (part.data as Record<string, unknown>)
      : {};

  return {
    id: part.id ?? `${Date.now()}`,
    status:
      data.status === "complete" || data.status === "error" || data.status === "running"
        ? data.status
        : "running",
    label: typeof data.label === "string" ? data.label : "Agent activity",
    detail: typeof data.detail === "string" ? data.detail : "",
    toolName: typeof data.toolName === "string" ? data.toolName : "runtime",
    provider: typeof data.provider === "string" ? data.provider : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
  };
}

export function ChatSessionProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  const getMessagesBySession = useDataStore((s) => s.getMessagesBySession);
  const persistChatMessage = useDataStore((s) => s.persistChatMessage);
  const updateMessageContent = useDataStore((s) => s.updateMessageContent);
  const updateSessionTitle = useDataStore((s) => s.updateSessionTitle);
  const createArtifactRunFromPromptStream = useDataStore((s) => s.createArtifactRunFromPromptStream);
  const upsertPendingArtifactPlan = useDataStore((s) => s.upsertPendingArtifactPlan);
  const approvePendingArtifactPlan = useDataStore((s) => s.approvePendingArtifactPlan);
  const completePendingArtifactPlan = useDataStore((s) => s.completePendingArtifactPlan);
  const failPendingArtifactPlan = useDataStore((s) => s.failPendingArtifactPlan);
  const dismissPendingArtifactPlan = useDataStore((s) => s.dismissPendingArtifactPlan);
  const startAgentBrainRun = useDataStore((s) => s.startAgentBrainRun);
  const advanceAgentBrainRun = useDataStore((s) => s.advanceAgentBrainRun);
  const completeAgentBrainRun = useDataStore((s) => s.completeAgentBrainRun);
  const recordAgentObservation = useDataStore((s) => s.recordAgentObservation);
  const recordAgentMemory = useDataStore((s) => s.recordAgentMemory);
  const toggleMessageReaction = useDataStore((s) => s.toggleMessageReaction);
  const addNotification = useDataStore((s) => s.addNotification);
  const createPlan = useDataStore((s) => s.createPlan);
  const buildPlanTasks = useDataStore((s) => s.buildPlanTasks);
  const automatePlan = useDataStore((s) => s.automatePlan);
  const schedulePlan = useDataStore((s) => s.schedulePlan);
  const getPlan = useDataStore((s) => s.getPlan);
  const {
    projects,
    workspaces,
    datasets,
    contacts,
    teamMembers,
    agentMemories,
    researchDocs,
    getTasksByProject,
  } = useDataStore();
  const pendingArtifactPlans = useDataStore((s) => s.pendingArtifactPlans);
  const { projectId, contextChips } = useSelectionStore();
  const { composerMode, setComposerMode } = useChatStore();
  const [planBusy, setPlanBusy] = useState(false);
  const onboardingProfile = useOnboardingStore((s) => s.profile);
  const onboardingAnswers = useOnboardingStore((s) => s.answers);
  const { status: authStatus } = useAuthStore();
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const setAgentWorking = useShellStore((s) => s.setAgentWorking);
  const [activities, setActivities] = useState<ChatActivity[]>([]);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const activeBrainRunIdRef = useRef<string | null>(null);
  const composerModeForRequestRef = useRef<ComposerMode | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const activeProjectId = projectId ?? project?.id ?? projects[0]?.id ?? "proj-1";
  const workspace = workspaces.find((w) => w.id === project?.workspaceId);
  const pendingBriefPlan = useMemo(
    () =>
      pendingArtifactPlans.find(
        (plan) =>
          plan.sessionId === sessionId &&
          plan.status === "draft" &&
          (!projectId || plan.projectId === projectId),
      ) ?? null,
    [pendingArtifactPlans, projectId, sessionId],
  );

  const initialMessages = useMemo(() => {
    if (!sessionId) return [];
    return getMessagesBySession(sessionId).map(messageToUi);
  }, [getMessagesBySession, sessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages,
            sessionId,
            projectId,
            projectName: project?.name,
            projectSlug: project?.slug,
            workspaceName: workspace?.name,
            composerMode: composerModeForRequestRef.current ?? composerMode,
            contextChips,
            model: authStatus?.model,
            tasksSummary: projectId
              ? getTasksByProject(projectId).slice(0, 12).map((task) => ({
                  identifier: task.identifier,
                  title: task.title,
                  status: task.status,
                  description: task.description,
                  priority: task.priority,
                  assignee: task.assignee,
                  dueDate: task.dueDate,
                }))
              : [],
            contactsSummary: projectId
              ? contacts
                  .filter((contact) => contact.projectId === projectId)
                  .slice(0, 8)
                  .map((contact) => ({
                    name: contact.name,
                    company: contact.company,
                    notes: contact.notes,
                    lastActivity: contact.lastActivity,
                  }))
              : [],
            teamSummary: projectId
              ? teamMembers
                  .filter((member) => member.projectId === projectId)
                  .slice(0, 8)
                  .map((member) => ({
                    name: member.name,
                    role: member.role,
                    status: member.status,
                  }))
              : [],
            datasetsSummary: projectId
              ? datasets
                  .filter((dataset) => dataset.projectId === projectId)
                  .slice(0, 6)
                  .map((dataset) => ({
                    name: dataset.name,
                    domainId: dataset.domainId,
                    sourceKind: dataset.sourceKind,
                    rowCount: dataset.rows.length,
                    columnCount: dataset.columns.length,
                    columns: dataset.columns
                      .slice(0, 10)
                      .map((column) =>
                        column.semanticRole
                          ? `${column.label} (${column.semanticRole})`
                          : column.label,
                      ),
                  }))
              : [],
            memoriesSummary: projectId
              ? agentMemories
                  .filter((memory) => memory.projectId === projectId)
                  .slice(0, 8)
                  .map((memory) => ({
                    kind: memory.kind,
                    title: memory.title,
                    body: memory.body,
                    confidence: memory.confidence,
                  }))
              : [],
            researchSummary: projectId
              ? researchDocs
                  .filter((doc) => doc.projectId === projectId)
                  .slice(0, 20)
                  .map((doc) => ({
                    kind: doc.kind,
                    entity: doc.entity,
                    title: doc.title,
                    summary: doc.summary,
                    sourceUrl: doc.sourceUrl,
                  }))
              : [],
            recentMessages: sessionId
              ? getMessagesBySession(sessionId)
                  .slice(-8)
                  .map((message) => ({
                    role: message.role,
                    content: stripNexusMarkers(message.content),
                  }))
                  .filter((message) => message.content.trim().length > 0)
              : [],
            businessProfile: onboardingProfile
              ? {
                  businessName: onboardingAnswers?.businessName,
                  summary: onboardingProfile.summary,
                  industry: onboardingProfile.industry,
                  businessModel: onboardingProfile.businessModel,
                  valueProposition: onboardingProfile.valueProposition,
                  targetCustomers: onboardingProfile.targetCustomers,
                }
              : undefined,
          },
        }),
      }),
    [
      authStatus?.model,
      agentMemories,
      composerMode,
      contextChips,
      contacts,
      datasets,
      getMessagesBySession,
      getTasksByProject,
      onboardingAnswers,
      onboardingProfile,
      project?.name,
      project?.slug,
      projectId,
      researchDocs,
      sessionId,
      teamMembers,
      workspace?.name,
    ],
  );

  const chat = useChat({
    id: sessionId ?? "empty-session",
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type !== "data-activity") return;
      const activity = normalizeActivity(part);
      setActivities((current) => {
        const next = current.filter((item) => {
          if (item.id === activity.id) return false;
          if (
            activity.status !== "running" &&
            item.status === "running" &&
            item.toolName === activity.toolName
          ) {
            return false;
          }
          return true;
        });
        return [...next, activity];
      });
    },
    onError: (error) => {
      setActivities([]);
      const runId = activeBrainRunIdRef.current;
      if (runId) {
        completeAgentBrainRun(runId, "failed", error.message || "Chat stream failed.");
        activeBrainRunIdRef.current = null;
      }
      const code = (error as Error & { code?: string }).code;
      if (code === "AUTH_REQUIRED") {
        toast.error("Connect Cursor to start chatting.");
        setSettingsOpen(true);
        return;
      }
      toast.error(error.message || "Failed to send message.");
    },
    onFinish: ({ message }) => {
      setActivities([]);
      if (!sessionId || message.role !== "assistant") return;
      const content = uiMessageToText(message);
      void persistChatMessage(sessionId, content, "assistant", message.id);
      const runId = activeBrainRunIdRef.current;
      if (runId) {
        advanceAgentBrainRun(
          runId,
          "deliver",
          "Assistant response delivered",
          content.slice(0, 240) || "The assistant response was delivered to chat.",
        );
        recordAgentObservation(
          runId,
          "Chat answer",
          content.slice(0, 500) || "Assistant response delivered.",
          [message.id],
        );
        completeAgentBrainRun(runId);
        activeBrainRunIdRef.current = null;
      }
    },
  });

  useEffect(() => {
    const running =
      artifactBusy ||
      chat.status === "submitted" ||
      chat.status === "streaming" ||
      activities.some((activity) => activity.status === "running");
    setAgentWorking(running);

    return () => setAgentWorking(false);
  }, [activities, artifactBusy, chat.status, setAgentWorking]);

  useEffect(() => {
    if (!sessionId) {
      chat.setMessages([]);
      setActivities([]);
      setArtifactBusy(false);
      activeBrainRunIdRef.current = null;
      return;
    }
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    setActivities([]);
  }, [sessionId]);

  const produceApprovedBriefPlan = async (plan: PendingArtifactPlan) => {
    if (!sessionId) return;
    setArtifactBusy(true);
    const approvedPlan = approvePendingArtifactPlan(plan.id) ?? plan;
    if (approvedPlan.sourceBrainRunId) {
      advanceAgentBrainRun(
        approvedPlan.sourceBrainRunId,
        "deliver",
        "Brief plan approved",
        "The user approved the Working Doc plan and artifact production can begin.",
      );
      completeAgentBrainRun(approvedPlan.sourceBrainRunId);
    }
    const productionRun = startAgentBrainRun({
      projectId: activeProjectId,
      sessionId,
      request: approvedPlan.prompt,
      title: "Brief artifact production",
      intent: "brief",
      outputKind: "artifact",
      model: authStatus?.model,
    });
    activeBrainRunIdRef.current = productionRun.id;
    advanceAgentBrainRun(
      productionRun.id,
      "plan",
      "Approved plan locked",
      "The approved Working Doc plan is locked for HTML artifact production.",
    );
    const assistant = await persistChatMessage(
      sessionId,
      [
        "Approved. Dexter is producing the HTML brief artifact from the selected plan.",
        "",
        "## Production stream",
        "",
        "**Current:** Locking plan and preparing workspace evidence",
      ].join("\n"),
      "assistant",
    );
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));

    const completedProgress: string[] = [];
    let currentProgress = "Locking plan and preparing workspace evidence";
    const buildProgressBody = (current?: string) => [
      "Approved. Dexter is producing the HTML brief artifact from the selected plan.",
      "",
      "## Production stream",
      "",
      ...(current ? [`**Current:** ${current}`, ""] : []),
      ...(completedProgress.length > 0
        ? [
            "**Completed:**",
            ...completedProgress.map((item) => `- ${item}`),
          ]
        : []),
    ].join("\n");
    const renderProgress = (line: string) => {
      if (currentProgress && currentProgress !== line && !completedProgress.includes(currentProgress)) {
        completedProgress.push(currentProgress);
      }
      currentProgress = line;
      void updateMessageContent(assistant.id, buildProgressBody(currentProgress)).then(() => {
        chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      });
    };

    try {
      renderProgress("Approval received: locked plan and started artifact production");
      const run = await createArtifactRunFromPromptStream(
        approvedPlan.prompt,
        activeProjectId,
        (event) => {
          advanceAgentBrainRun(
            productionRun.id,
            artifactEventToBrainStage(event.event),
            event.data.label ?? event.event.replace(/_/g, " "),
            event.data.detail ?? "Artifact production event completed.",
          );
          if (event.data.label) {
            renderProgress(event.data.detail ? `${event.data.label}: ${event.data.detail}` : event.data.label);
          }
        },
      );
      completePendingArtifactPlan(approvedPlan.id, run.id);
      recordAgentObservation(
        productionRun.id,
        "Brief artifact created",
        `${run.title} is ready with ${run.evidence.length} evidence sources and ${run.drafts.length} draft version(s).`,
        [run.id],
      );
      recordAgentMemory({
        projectId: activeProjectId,
        runId: productionRun.id,
        title: "Latest brief artifact",
        body: `${run.title} was generated from an approved Working Doc plan.`,
        kind: "project",
        source: "agent",
        confidence: 0.82,
      });
      completeAgentBrainRun(productionRun.id);
      activeBrainRunIdRef.current = null;

      if (currentProgress && !completedProgress.includes(currentProgress)) {
        completedProgress.push(currentProgress);
      }
      await updateMessageContent(
        assistant.id,
        [
          "## Production stream",
          "",
          "**Completed:**",
          ...completedProgress.map((item) => `- ${item}`),
          "",
          `Created **${run.title}**.`,
          "",
          "The approved HTML artifact is ready in Briefs with evidence, tables, charts, recommendations, source notes, and audit status.",
          "",
          `File: \`${run.drafts[run.drafts.length - 1]?.htmlArtifact?.fileName ?? "brief-artifact.html"}\``,
          "",
          `[[nexus:view-brief:${run.id}]]`,
        ].join("\n"),
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      toast.success("Brief artifact created.");
    } catch (error) {
      failPendingArtifactPlan(approvedPlan.id);
      completeAgentBrainRun(
        productionRun.id,
        "failed",
        error instanceof Error ? error.message : "Artifact production failed.",
      );
      activeBrainRunIdRef.current = null;
      await updateMessageContent(
        assistant.id,
        `I could not create the brief artifact. ${error instanceof Error ? error.message : "The stream failed."}`,
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      toast.error("Brief creation failed.");
    } finally {
      setArtifactBusy(false);
    }
  };

  const decidePendingBriefPlan = async (decision: "create" | "dismiss") => {
    if (!pendingBriefPlan || !sessionId || artifactBusy) return;
    if (decision === "dismiss") {
      dismissPendingArtifactPlan(pendingBriefPlan.id);
      await persistChatMessage(
        sessionId,
        "No problem. I dismissed that brief plan and kept the conversation open.",
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      return;
    }

    await persistChatMessage(sessionId, "Create the HTML brief from this plan.", "user");
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    await produceApprovedBriefPlan(pendingBriefPlan);
  };

  const draftPlanFromConversation = async (readyMessage?: string) => {
    if (!sessionId || planBusy) return;
    if (!authStatus?.connected) {
      toast.warning("Connect a model to draft a plan.");
      setSettingsOpen(true);
      return;
    }
    setPlanBusy(true);
    try {
      if (readyMessage) {
        await persistChatMessage(sessionId, readyMessage, "assistant");
        chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      }

      const history = getMessagesBySession(sessionId);
      const userMessages = history.filter((message) => message.role === "user");
      const latestPlanningRequest = [...userMessages]
        .reverse()
        .find((message) => shouldClarify(stripNexusMarkers(message.content)));
      const request =
        stripNexusMarkers(latestPlanningRequest?.content ?? "") ||
        stripNexusMarkers(userMessages[userMessages.length - 1]?.content ?? "") ||
        "Draft a plan for the current project.";
      const conversation = history
        .slice(-20)
        .map((message) => `${message.role}: ${stripNexusMarkers(message.content)}`)
        .filter((line) => line.split(": ").slice(1).join(": ").trim().length > 0)
        .join("\n");
      const draft = await requestPlan({
        request,
        projectName: project?.name,
        conversation,
        model: authStatus?.model,
      });
      const record = createPlan({
        projectId: projectId || undefined,
        sessionId,
        draft,
      });
      await persistChatMessage(
        sessionId,
        `Here's the plan I drafted from our conversation — review and edit it, then build when you're ready.\n\n${encodePlanMarker(record.id)}`,
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to draft the plan.");
    } finally {
      setPlanBusy(false);
    }
  };

  const draftOrganicPlanIntake = async () => {
    if (!sessionId || planBusy) return;
    setPlanBusy(true);
    try {
      const history = getMessagesBySession(sessionId);
      const userMessages = history.filter((message) => message.role === "user");
      const latestPlanningRequest = [...userMessages]
        .reverse()
        .find((message) => shouldClarify(stripNexusMarkers(message.content)));
      const request =
        stripNexusMarkers(latestPlanningRequest?.content ?? "") ||
        stripNexusMarkers(userMessages[userMessages.length - 1]?.content ?? "") ||
        "Draft a plan for the current project.";
      const conversation = history
        .slice(-20)
        .map((message) => `${message.role}: ${stripNexusMarkers(message.content)}`)
        .filter((line) => line.split(": ").slice(1).join(": ").trim().length > 0)
        .join("\n");
      const questions = previousPlanQuestions(history);
      const intake = await requestPlanIntake({
        request,
        projectName: project?.name,
        conversation,
        model: authStatus?.model,
        previousQuestions: questions,
        memories: agentMemories
          .filter((memory) => memory.projectId === activeProjectId)
          .slice(0, 8)
          .map((memory) => ({
            kind: memory.kind,
            title: memory.title,
            body: memory.body,
            confidence: memory.confidence,
          })),
      });
      await persistChatMessage(sessionId, formatPlanIntakeMessage(intake, questions.length), "assistant");
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    } finally {
      setPlanBusy(false);
    }
  };

  const send = async (text: string) => {
    if (!sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    if (!authStatus?.connected) {
      toast.warning("Connect Cursor to start chatting.");
      setSettingsOpen(true);
      return;
    }

    setActivities([]);
    // Display/title/intent uses text without nexus markers; the model still
    // receives the full `text` (with attachment file blocks) via sendMessage.
    const cleanText = stripNexusMarkers(text);
    const previousMessages = getMessagesBySession(sessionId);
    await persistChatMessage(sessionId, text, "user");
    const approvedBriefPlan = pendingBriefPlan && isBriefApproval(cleanText) ? pendingBriefPlan : null;
    const shouldPlanBrief =
      !approvedBriefPlan &&
      shouldRouteToBrief(cleanText, previousMessages);

    const sessionMessages = getMessagesBySession(sessionId);
    if (sessionMessages.filter((m) => m.role === "user").length === 1) {
      void updateSessionTitle(sessionId, cleanText);
    }

    if (shouldPlanBrief) {
      setArtifactBusy(true);
      // Show the user's message immediately while the brief plan is assembled.
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      const planningRun = startAgentBrainRun({
        projectId: activeProjectId,
        sessionId,
        request: cleanText,
        title: "Brief planning run",
        intent: "brief",
        outputKind: "plan",
        model: authStatus?.model,
      });
      activeBrainRunIdRef.current = planningRun.id;
      advanceAgentBrainRun(
        planningRun.id,
        "plan",
        "Working Doc plan started",
        "Nexus is preparing a plan first so artifact production remains approval-gated.",
      );
      if (shouldRememberUserInstruction(text)) {
        recordAgentMemory({
          projectId: activeProjectId,
          runId: planningRun.id,
          title: "User instruction",
          body: cleanText,
          source: "user",
          confidence: 0.9,
          pinned: true,
        });
        void appendAgentNote("memory.md", `Preference — ${project?.name ?? "workspace"}`, cleanText);
      }
      const modelPrompt = buildBriefPrompt(text, previousMessages, project?.name);
      const markdown = buildBriefPlanMarkdown({
        userRequest: text,
        projectName: project?.name,
      });
      const projectTasks = projectId ? getTasksByProject(projectId) : [];
      const projectDatasets = datasets.filter((dataset) => dataset.projectId === projectId);
      const projectContacts = contacts.filter((contact) => contact.projectId === projectId);
      const projectTeamMembers = teamMembers.filter((member) => member.projectId === projectId);
      const stages = planningStages({
        userRequest: text,
        tasks: projectTasks,
        datasets: projectDatasets,
        contacts: projectContacts,
        teamMembers: projectTeamMembers,
        previousMessages,
      });
      const plan: PendingArtifactPlan = {
        id: `brief-plan-${crypto.randomUUID().slice(0, 8)}`,
        sessionId,
        projectId: projectId ?? undefined,
        title: briefPlanTitle(text),
        prompt: modelPrompt,
        markdown,
        status: "draft",
        deliverableFormat: "html",
        createdAt: new Date().toISOString(),
        sourceBrainRunId: planningRun.id,
      };
      if (pendingBriefPlan) {
        dismissPendingArtifactPlan(pendingBriefPlan.id);
      }
      upsertPendingArtifactPlan(plan);
      const assistant = await persistChatMessage(
        sessionId,
        buildPlanningProgress({ current: stages[0]?.label, completed: [] }),
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      const completedStages: Array<{ label: string; detail: string }> = [];
      for (const stage of stages) {
        await sleep(260);
        completedStages.push(stage);
        advanceAgentBrainRun(planningRun.id, "plan", stage.label, stage.detail);
        const nextStage = stages[completedStages.length];
        await updateMessageContent(
          assistant.id,
          buildPlanningProgress({
            current: nextStage?.label,
            completed: completedStages,
          }),
        );
        chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      }
      await sleep(160);
      await updateMessageContent(
        assistant.id,
        buildPlanningResult({ stages, markdown }),
      );
      recordAgentObservation(
        planningRun.id,
        "Brief plan prepared",
        `Prepared ${plan.title} and paused at the approval gate.`,
        [plan.id],
      );
      completeAgentBrainRun(planningRun.id, "needs_approval");
      activeBrainRunIdRef.current = null;
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      setArtifactBusy(false);
      return;
    }

    if (approvedBriefPlan) {
      await produceApprovedBriefPlan(approvedBriefPlan);
      return;
    }

    const explicitTaskRequest = composerMode !== "plan" && shouldRouteToTasks(cleanText);
    const autoPlanRequest = composerMode !== "plan" && !explicitTaskRequest && shouldClarify(cleanText);
    const planModeForTurn = composerMode === "plan" || autoPlanRequest;

    if (autoPlanRequest) {
      setComposerMode("plan");
    }

    if (planModeForTurn) {
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      try {
        await draftOrganicPlanIntake();
        return;
      } catch (error) {
        console.warn("Organic plan intake failed; falling back to deterministic intake.", error);
      }

      const fallbackQuestionIndex = fallbackPlanQuestionIndex(previousMessages);
      const fallbackQuestions = fallbackPlanQuestions(cleanText);
      if (fallbackQuestionIndex !== null) {
        const nextQuestionIndex = fallbackQuestionIndex + 1;
        if (nextQuestionIndex < fallbackQuestions.length) {
          const nextQuestion = buildFallbackPlanQuestion(nextQuestionIndex, cleanText);
          if (nextQuestion) {
            await persistChatMessage(sessionId, nextQuestion, "assistant");
            chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
            return;
          }
        }

        const history = getMessagesBySession(sessionId);
        chat.setMessages(history.map(messageToUi));
        await draftPlanFromConversation(buildPlanIntakeSummary(history));
        return;
      }

      if (autoPlanRequest || shouldClarify(cleanText)) {
        const firstQuestion = buildFallbackPlanQuestion(0, cleanText);
        if (firstQuestion) {
          await persistChatMessage(sessionId, firstQuestion, "assistant");
          chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
          return;
        }
      }

      if (latestAssistantNeedsPlanAnswer(previousMessages) && !shouldClarify(cleanText)) {
        const history = getMessagesBySession(sessionId);
        chat.setMessages(history.map(messageToUi));
        await draftPlanFromConversation(buildPlanIntakeSummary(history));
        return;
      }

      if (shouldFinalizePlanIntakeAfterAnswer(previousMessages, cleanText)) {
        const history = getMessagesBySession(sessionId);
        chat.setMessages(history.map(messageToUi));
        await draftPlanFromConversation(buildPlanIntakeSummary(history));
        return;
      }
    }

    if (!planModeForTurn) {
      // Natural-language "create tasks…" routes to the task-proposal artifact
      // (the user message is already persisted above).
      if (explicitTaskRequest) {
        await runTaskProposal(cleanText);
        return;
      }
    }

    const chatRun = startAgentBrainRun({
      projectId: activeProjectId,
      sessionId,
      request: cleanText,
      title: "Chat response run",
      intent: "conversation",
      outputKind: "conversation",
      model: authStatus?.model,
    });
    activeBrainRunIdRef.current = chatRun.id;
    advanceAgentBrainRun(
      chatRun.id,
      "execute_tools",
      "Model request started",
      "Sent the current project context pack, memory notes, and recent conversation to the chat model.",
    );
    if (shouldRememberUserInstruction(text)) {
      recordAgentMemory({
        projectId: activeProjectId,
        runId: chatRun.id,
        title: "User instruction",
        body: cleanText,
        source: "user",
        confidence: 0.9,
        pinned: true,
      });
      void appendAgentNote("memory.md", `Preference — ${project?.name ?? "workspace"}`, cleanText);
    }
    composerModeForRequestRef.current = planModeForTurn ? "plan" : null;
    try {
      await chat.sendMessage({ text });
    } finally {
      composerModeForRequestRef.current = null;
    }
  };

  const composeEmail = async (instruction: string) => {
    if (!sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    if (!authStatus?.connected) {
      toast.warning("Connect a model to draft emails.");
      setSettingsOpen(true);
      return;
    }

    setActivities([]);
    await persistChatMessage(sessionId, instruction, "user");
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));

    setArtifactBusy(true);
    const run = startAgentBrainRun({
      projectId: activeProjectId,
      sessionId,
      request: instruction,
      title: "Email draft",
      intent: "conversation",
      outputKind: "conversation",
      model: authStatus?.model,
    });
    activeBrainRunIdRef.current = run.id;
    advanceAgentBrainRun(
      run.id,
      "execute_tools",
      "Drafting email",
      "Writing an email in the firm voice from your instruction.",
    );

    try {
      const draft = await draftEmailApi(instruction);
      await persistChatMessage(
        sessionId,
        `Here's a draft email ready to review and send.\n\n${encodeEmailMarker(draft)}`,
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      advanceAgentBrainRun(run.id, "deliver", "Email drafted", draft.subject);
      recordAgentObservation(run.id, "Email draft", draft.subject, []);
      completeAgentBrainRun(run.id);
    } catch (error) {
      completeAgentBrainRun(
        run.id,
        "failed",
        error instanceof Error ? error.message : "Email draft failed.",
      );
      toast.error(error instanceof Error ? error.message : "Failed to draft email.");
    } finally {
      activeBrainRunIdRef.current = null;
      setArtifactBusy(false);
    }
  };

  // Generate the task-proposal artifact for an already-persisted user instruction.
  const runTaskProposal = async (instruction: string) => {
    if (!sessionId) return;
    setArtifactBusy(true);
    // Render the user's message right away and show a descriptive status so the
    // chat is never blank while the proposal request is in flight.
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    setActivities([
      {
        id: "task-proposal-status",
        status: "running",
        label: "Breaking this into tasks",
        detail: "Turning your request into actionable tasks with owners.",
        toolName: "task_proposal",
      },
    ]);
    const run = startAgentBrainRun({
      projectId: activeProjectId,
      sessionId,
      request: instruction,
      title: "Task proposal",
      intent: "task_proposal",
      outputKind: "task_proposal",
      model: authStatus?.model,
    });
    activeBrainRunIdRef.current = run.id;
    advanceAgentBrainRun(
      run.id,
      "execute_tools",
      "Proposing tasks",
      "Breaking your request into actionable tasks for the board.",
    );

    try {
      const team = projectId
        ? teamMembers.filter((member) => member.projectId === projectId).map((member) => member.name)
        : [];
      const existing = projectId
        ? getTasksByProject(projectId).map((task) => task.title).slice(0, 30)
        : [];
      const proposed = await proposeTasksApi({
        instruction,
        projectName: project?.name,
        team,
        existingTasks: existing,
      });
      await persistChatMessage(
        sessionId,
        `I broke that into ${proposed.length} task${proposed.length === 1 ? "" : "s"} you can add to the board.\n\n${encodeTasksMarker(proposed)}`,
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
      advanceAgentBrainRun(run.id, "deliver", "Tasks proposed", `${proposed.length} tasks ready for the board.`);
      recordAgentObservation(run.id, "Task proposal", `${proposed.length} tasks proposed.`, []);
      completeAgentBrainRun(run.id);
    } catch (error) {
      completeAgentBrainRun(
        run.id,
        "failed",
        error instanceof Error ? error.message : "Task proposal failed.",
      );
      toast.error(error instanceof Error ? error.message : "Failed to propose tasks.");
    } finally {
      activeBrainRunIdRef.current = null;
      setArtifactBusy(false);
      setActivities([]);
    }
  };

  const proposeTasks = async (instruction: string) => {
    if (!sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    if (!authStatus?.connected) {
      toast.warning("Connect a model to propose tasks.");
      setSettingsOpen(true);
      return;
    }

    setActivities([]);
    await persistChatMessage(sessionId, instruction, "user");
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    await runTaskProposal(instruction);
  };

  // After the interactive questions are answered, turn the request + answers
  // into an actionable flow proposal (tasks for the board, which can then be
  // assigned, briefed, and notified on approval).
  const submitClarifyAnswers = async (request: string, answers: string) => {
    if (!sessionId || !authStatus?.connected) return;
    setActivities([]);
    const answersText = `My answers:\n${answers}`;
    await persistChatMessage(sessionId, answersText, "user");
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    await runTaskProposal(
      `${request}\n\nThe user answered these intake questions:\n${answers}\n\nProduce a concrete set of tasks to execute this.`,
    );

    // The logical next step after the answers + tasks: capture the premise as a
    // .md document on the canvas, then Socratically confirm and ask how the user
    // wants it delivered — and remember that preference.
    const markdown = buildPremiseMarkdown({ request, answers, projectName: project?.name });
    const docPayload = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      filename: slugifyFilename(request),
      title: `Premise — ${project?.name ?? "this work"}`,
      markdown,
    };
    const deliveryPayload = {
      request,
      premise: stripNexusMarkers(request).slice(0, 240),
      options: [
        "Add the tasks to the board",
        "Produce a full HTML brief",
        "Keep this .md doc as the working doc",
        "Let's revise the premise first",
      ],
    };
    await persistChatMessage(
      sessionId,
      `I captured our premise as a document on the canvas — open it and tell me what's right and what's off.\n\n${encodeDocMarker(docPayload)}\n\n${encodeDeliveryMarker(deliveryPayload)}`,
      "assistant",
    );
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));

    // Keep a running session note so the agent has continuity next time.
    void appendAgentNote(
      "session.md",
      `${project?.name ?? "Session"} — ${stripNexusMarkers(request).slice(0, 80)}`,
      `Request: ${stripNexusMarkers(request)}\n\nIntake answers:\n${answers}\n\nDelivered a premise doc and asked how to proceed.`,
    );
  };

  // The user picked how they want the premise delivered. Record the preference,
  // log the session, and execute the choice (tasks already on offer above; a
  // brief is produced via the approval-gated flow; otherwise continue the
  // conversation so the model carries it forward).
  const submitDeliveryChoice = async (
    request: string,
    premise: string,
    choices: string[],
    note: string,
  ) => {
    if (!sessionId) return;
    const chosen = choices.length ? choices.join(", ") : "use your best judgment";
    const summary = [`Deliver this as: ${chosen}.`, note ? `Notes: ${note}` : ""]
      .filter(Boolean)
      .join(" ");
    await persistChatMessage(sessionId, summary, "user");
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));

    // Remember the delivery preference durably.
    recordAgentMemory({
      projectId: activeProjectId,
      title: "Delivery preference",
      body: `For "${stripNexusMarkers(request).slice(0, 120)}": ${chosen}.${note ? ` ${note}` : ""}`,
      kind: "preference",
      source: "user",
      confidence: 0.85,
      pinned: true,
    });
    void appendAgentNote(
      "memory.md",
      `Delivery preference — ${project?.name ?? "workspace"}`,
      `${chosen}${note ? ` — ${note}` : ""}`,
    );

    if (choices.some((c) => /brief/i.test(c))) {
      // Route into the approval-gated brief flow.
      await send(`Produce a brief for: ${request}. ${note}`.trim());
      return;
    }

    // Otherwise let the model acknowledge and carry the premise + preference
    // forward conversationally (it has the premise context and the soul/agents
    // files telling it to honor preferences and deliver accordingly).
    await send(
      `Premise confirmed. Deliver this as: ${chosen}.${note ? ` Adjust the premise: ${note}.` : ""} ${premise ? `Premise: ${premise}` : ""}`.trim(),
    );
  };

  // The user reacted to one of Dexter's messages. Persist the reaction, confirm
  // it, and turn it into a durable learning signal: a pinned preference memory
  // plus a memory.md note — both flow back into Dexter's system prompt on the
  // next turn, so approvals are reinforced and mistakes are avoided.
  const reactToMessage = (message: UIMessage, emoji: string) => {
    if (message.role !== "assistant") return;
    const reaction = getReaction(emoji);
    if (!reaction) return;

    const { added } = toggleMessageReaction(message.id, emoji);
    if (!added) {
      toast.message(`Removed ${emoji}`);
      return;
    }

    const snippet = stripNexusMarkers(uiMessageToText(message));
    const { title, body } = reaction.learn(snippet);

    toast.success(reaction.toast);
    recordAgentMemory({
      projectId: activeProjectId,
      title,
      body,
      kind: "preference",
      source: "user",
      confidence: reaction.sentiment === "negative" ? 0.9 : 0.85,
      pinned: reaction.sentiment !== "neutral",
    });
    void appendAgentNote(
      "memory.md",
      `${title} — ${project?.name ?? "workspace"}`,
      body,
    );
    addNotification({
      type: "info",
      title: `You reacted ${emoji} to Dexter`,
      body: reaction.meaning,
      projectId: activeProjectId,
    });
  };

  // Plan Mode intake signals, derived from the latest assistant turn (cleared by
  // a following user turn): the inline composer card uses this as the single
  // planning surface.
  const { planIntake, planChips, planReady } = useMemo(() => {
    let intakeTurnCount = 0;
    for (const message of chat.messages) {
      if (message.role !== "assistant") continue;
      const text = uiMessageToText(message);
      const chips = parseChipsMarker(text).chips;
      const ready = parsePlanReadyMarker(text).ready;
      const cleanText = stripPlanMarkers(text);
      if ((chips.length > 0 || ready || cleanText.includes("?")) && !text.includes("[[nexus:plan:")) {
        intakeTurnCount += 1;
      }
    }

    const empty: {
      planIntake: PlanIntake | null;
      planChips: string[];
      planReady: boolean;
    } = { planIntake: null, planChips: [], planReady: false };
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
      const message = chat.messages[i];
      if (message.role === "assistant") {
        const text = uiMessageToText(message);
        const { chips: markerChips, cleanText: textWithoutChips } = parseChipsMarker(text);
        const { ready, cleanText: textWithoutReady } = parsePlanReadyMarker(textWithoutChips);
        const fullPrompt = stripPlanMarkers(textWithoutReady);
        const proseChoices = extractChoicesFromMessage(fullPrompt);
        const chips = bestPlanChoices(markerChips, proseChoices);
        const question = planCardQuestion(textWithoutReady);
        const hasQuestion = question.includes("?") || fullPrompt.includes("?");
        if (!ready && chips.length === 0 && !hasQuestion) return empty;
        const intake: PlanIntake = {
          question,
          chips,
          ready,
          progress: planCardProgress(textWithoutReady, intakeTurnCount),
        };
        return {
          // Prefer explicit chips; otherwise derive them from an enumerated
          // question the model asked in plain prose.
          planIntake: intake,
          planChips: chips,
          planReady: ready,
        };
      }
      if (message.role === "user") return empty;
    }
    return empty;
  }, [chat.messages]);

  // Generate the structured, editable plan from the conversation (deterministic
  // /api/plan), store it, and post it into the thread as an artifact reference.
  const generatePlan = async () => {
    if (!sessionId || planBusy) return;
    if (!authStatus?.connected) {
      toast.warning("Connect a model to draft a plan.");
      setSettingsOpen(true);
      return;
    }
    setPlanBusy(true);
    try {
      const history = getMessagesBySession(sessionId);
      const userMessages = history.filter((message) => message.role === "user");
      const latestPlanningRequest = [...userMessages]
        .reverse()
        .find((message) => shouldClarify(stripNexusMarkers(message.content)));
      const request =
        stripNexusMarkers(latestPlanningRequest?.content ?? "") ||
        stripNexusMarkers(userMessages[userMessages.length - 1]?.content ?? "") ||
        "Draft a plan for the current project.";
      const conversation = history
        .slice(-20)
        .map((message) => `${message.role}: ${stripNexusMarkers(message.content)}`)
        .filter((line) => line.split(": ").slice(1).join(": ").trim().length > 0)
        .join("\n");
      const draft = await requestPlan({
        request,
        projectName: project?.name,
        conversation,
        model: authStatus?.model,
      });
      const record = createPlan({
        projectId: projectId || undefined,
        sessionId,
        draft,
      });
      await persistChatMessage(
        sessionId,
        `Here's the plan I drafted from our conversation — review and edit it, then build when you're ready.\n\n${encodePlanMarker(record.id)}`,
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to draft the plan.");
    } finally {
      setPlanBusy(false);
    }
  };

  // Approve/Build: turn the plan into board tasks, then auto-chain the rest of
  // the pipeline — automations, scheduling, and downloadable deliverables —
  // each posted as its own artifact card, finishing in Auto mode.
  const buildPlan = async (planId: string) => {
    const plan = getPlan(planId);
    const created = buildPlanTasks(planId);
    const automations = automatePlan(planId);
    const schedule = schedulePlan(planId);
    setComposerMode("auto");

    if (plan) {
      const approvalSignal = `The user approved "${plan.title}" with ${plan.steps.length} editable steps. For similar plans, prefer this level of structure and keep approval-gated steps explicit.`;
      recordAgentMemory({
        projectId: plan.projectId ?? activeProjectId,
        title: "Planning preference - approved structure",
        body: approvalSignal,
        kind: "preference",
        source: "user",
        confidence: 0.8,
        pinned: true,
      });
      void appendAgentNote(
        "memory.md",
        `Planning preference — ${project?.name ?? "workspace"}`,
        approvalSignal,
      );
    }

    if (sessionId) {
      const taskLine =
        created.length > 0
          ? `Approved. I added ${created.length} step${created.length === 1 ? "" : "s"} to the board.`
          : `Approved — assign this chat to a project to push the steps onto a board.`;

      await persistChatMessage(
        sessionId,
        `${taskLine} Now setting up the automation, schedule, and deliverables.`,
        "assistant",
      );
      await persistChatMessage(
        sessionId,
        `I turned each step into an automation rule — review, pause, or resume any of them.\n\n${encodeAutomationMarker(planId)}`,
        "assistant",
      );
      await persistChatMessage(
        sessionId,
        `Here's how the work lands on a schedule.\n\n${encodeScheduleMarker(planId)}`,
        "assistant",
      );
      await persistChatMessage(
        sessionId,
        `And here are the deliverables — a Markdown doc, an HTML presentation, and a PowerPoint. Download or present them anytime.\n\n${encodeDeliverablesMarker(planId)}`,
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    }

    toast.success(
      `Plan shipped — ${automations.length} automations, ${schedule.length} scheduled, deliverables ready`,
    );
  };

  const value: ChatSessionContextValue = {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    activities,
    pendingBriefPlan,
    planIntake,
    planChips,
    planReady,
    planBusy,
    generatePlan,
    buildPlan,
    artifactBusy,
    send,
    composeEmail,
    proposeTasks,
    submitClarifyAnswers,
    submitDeliveryChoice,
    decidePendingBriefPlan,
    reactToMessage,
    stop: chat.stop,
  };

  return (
    <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return context;
}
