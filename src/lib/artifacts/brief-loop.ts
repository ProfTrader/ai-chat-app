import type {
  AgentActionProposal,
  AuditResult,
  BriefDesignTemplate,
  BriefIntent,
  BriefStyle,
  Contact,
  DraftArtifact,
  ArtifactSection,
  EvidenceSource,
  Message,
  PlanArtifact,
  Project,
  RoadmapItem,
  Session,
  Task,
  TeamMember,
  VisualizationBlock,
  WorkLoopPhase,
  WorkRun,
} from "@/types";

const phaseOrder: WorkLoopPhase[] = [
  "plan",
  "iterate",
  "inspect",
  "create",
  "audit",
  "complete",
];

const phaseStatus = {
  plan: "draft",
  iterate: "running",
  inspect: "running",
  create: "running",
  audit: "ready",
  complete: "published",
} satisfies Record<WorkLoopPhase, WorkRun["status"]>;

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/^(create|make|build|draft|analyze|research)\s+/i, "")
    .trim();
  if (!cleaned) return "Research brief";
  return cleaned.length > 64 ? `${cleaned.slice(0, 61)}...` : cleaned;
}

export function detectBriefStyle(prompt: string): BriefStyle {
  const input = prompt.toLowerCase();
  if (/(competitor|competitive|market|dossier|category|positioning|benchmark)/.test(input)) {
    return "market_dossier";
  }
  if (/(ops|operation|internal|status|risk|blocker|launch|execution|weekly|daily)/.test(input)) {
    return "ops_report";
  }
  return "research_memo";
}

export function briefStyleLabel(style: BriefStyle) {
  return style === "market_dossier"
    ? "Market dossier"
    : style === "ops_report"
      ? "Internal ops report"
      : "Research memo";
}

function detectBriefIntent(prompt: string, style: BriefStyle): BriefIntent {
  const input = prompt.toLowerCase();
  if (/(risk|audit|compliance|control|governance|unsupported|assumption|quality|legal)/.test(input)) {
    return "risk_compliance";
  }
  if (style === "ops_report" || /(ops|operation|internal|status|blocker|launch|execution|workflow|queue|staff)/.test(input)) {
    return "operational_review";
  }
  if (style === "market_dossier") return "market_intelligence";
  if (/(performance|metric|kpi|snapshot|trend|revenue|payout|score)/.test(input)) {
    return "performance_snapshot";
  }
  if (/(action|roadmap|next step|owner|sequence|plan)/.test(input)) {
    return "action_plan";
  }
  return "executive_decision";
}

function selectDesignTemplate(intent: BriefIntent): BriefDesignTemplate {
  if (intent === "risk_compliance") return "risk_compliance";
  if (intent === "operational_review") return "ops_command";
  return "executive_board";
}

function buildArtifactSections({
  title,
  plan,
  evidence,
  visualizations,
  findings,
  recommendations,
  styleLabel,
}: {
  title: string;
  plan: PlanArtifact;
  evidence: EvidenceSource[];
  visualizations: VisualizationBlock[];
  findings: string[];
  recommendations: string[];
  styleLabel: string;
}): ArtifactSection[] {
  const kpi = visualizations.find((block) => block.kind === "kpi");
  const table = visualizations.find((block) => block.kind === "table");
  const charts = visualizations.filter((block) => block.kind !== "kpi" && block.kind !== "table");
  const tableColumns = Object.keys(table?.data[0] ?? {}).map((key) => ({
    key,
    label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    align: table?.data.some((row) => typeof row[key] === "number") ? ("right" as const) : ("left" as const),
  }));

  return [
    {
      id: id("artifact-section"),
      title: "Cover",
      purpose: "Frame the brief for fast review.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "hero",
          eyebrow: styleLabel,
          title,
          subtitle: plan.objective,
          meta: [
            { label: "Audience", value: plan.audience },
            { label: "Sources", value: String(evidence.length) },
            { label: "Criteria", value: String(plan.successCriteria.length) },
          ],
        },
        {
          id: id("artifact-block"),
          type: "summary",
          title: "Executive snapshot",
          body: `This artifact uses ${evidence.length} workspace evidence groups and keeps unsupported claims visible for review.`,
          takeaways: findings,
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Data Foundation",
      purpose: "Show the evidence base before recommendations.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "kpi_grid",
          title: kpi?.title ?? "Workspace signal",
          insight: kpi?.insight ?? "Current workspace evidence coverage.",
          items:
            kpi?.data.map((item) => ({
              label: String(item.label),
              value: item.value,
              detail: "Workspace source",
            })) ?? [],
          sourceIds: evidence.map((source) => source.id),
        },
        ...(table
          ? [
              {
                id: id("artifact-block"),
                type: "table" as const,
                table: {
                  id: id("artifact-table"),
                  title: table.title,
                  caption: table.insight,
                  columns: tableColumns,
                  rows: table.data,
                  sourceIds: evidence.map((source) => source.id),
                },
              },
            ]
          : []),
      ],
    },
    {
      id: id("artifact-section"),
      title: "Visual Analysis",
      purpose: "Convert the available signals into readable artifacts.",
      blocks: charts.map((chart) => ({
        id: id("artifact-block"),
        type: "chart" as const,
        chart: {
          id: id("artifact-chart"),
          type: chart.kind === "table" ? "bar" : chart.kind,
          title: chart.title,
          insight: chart.insight,
          xField: "label",
          yField: "value",
          data: chart.data,
          sourceIds: evidence.map((source) => source.id),
        },
      })),
    },
    {
      id: id("artifact-section"),
      title: "Findings And Recommendations",
      purpose: "Separate sourced conclusions from next actions.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "finding",
          title: "Source-backed findings",
          claims: findings.map((finding, index) => ({
            id: `claim-${index + 1}`,
            claim: finding,
            confidence: evidence[index]?.confidence ?? 0.72,
            citationIds: [evidence[index]?.id ?? evidence[0]?.id].filter(Boolean),
          })),
        },
        {
          id: id("artifact-block"),
          type: "recommendation",
          title: "Prioritized actions",
          recommendations: recommendations.map((recommendation, index) => ({
            priority: index === 0 ? "high" : index === 1 ? "medium" : "low",
            action: recommendation,
            expectedImpact: "Move the brief from insight into reviewed work.",
            sourceIds: [evidence[index]?.id ?? evidence[0]?.id].filter(Boolean),
          })),
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Handoff And Appendix",
      purpose: "Preserve sources and explain what happens after approval.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "task_proposal",
          title: "Agent handoff",
          body: "After approval, Nexus can propose tasks, owners, board status, and roadmap items without applying them until reviewed.",
        },
        {
          id: id("artifact-block"),
          type: "evidence",
          title: "Source evidence",
          sourceIds: evidence.map((source) => source.id),
        },
        {
          id: id("artifact-block"),
          type: "audit",
          title: "Audit appendix",
          checklistIds: ["plan", "sources", "claims", "charts", "actions", "audience", "export"],
        },
      ],
    },
  ];
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export function nextLoopPhase(phase: WorkLoopPhase): WorkLoopPhase {
  const index = phaseOrder.indexOf(phase);
  return phaseOrder[Math.min(index + 1, phaseOrder.length - 1)] ?? "plan";
}

export function previousLoopPhase(phase: WorkLoopPhase): WorkLoopPhase {
  const index = phaseOrder.indexOf(phase);
  return phaseOrder[Math.max(index - 1, 0)] ?? "plan";
}

export function statusForPhase(phase: WorkLoopPhase): WorkRun["status"] {
  return phaseStatus[phase];
}

export function createPlanArtifact(prompt: string, project?: Project): PlanArtifact {
  const timestamp = now();
  const objective = titleFromPrompt(prompt);

  return {
    id: id("plan"),
    objective,
    audience: "Workspace operators and project leads",
    questions: [
      "What decision should this brief help the reader make?",
      "Which workspace sources are considered authoritative?",
      "Should the final artifact optimize for executive summary, operational detail, or both?",
    ],
    assumptions: [
      "Use workspace data first before external sources.",
      "Label unsupported conclusions as assumptions.",
      "Keep the first artifact in-app as an HTML-style report.",
    ],
    sources: [
      project ? `${project.name} tasks` : "Selected project tasks",
      project ? `${project.name} contacts` : "Selected project contacts",
      "Recent chat sessions and project context",
    ],
    milestones: [
      "Plan the research brief",
      "Retrieve workspace evidence",
      "Inspect data quality and gaps",
      "Create the draft artifact",
      "Audit and publish when ready",
    ],
    successCriteria: [
      "All key claims are linked to evidence or marked as assumptions.",
      "The report includes at least one table and one visual summary.",
      "Audit score reaches 85 or higher with no failed critical checks.",
    ],
    approved: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildEvidenceSources({
  project,
  tasks,
  contacts,
  sessions,
  messages,
}: {
  project?: Project;
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
}): EvidenceSource[] {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const highPriority = tasks.filter((task) => task.priority === "high");
  const recentContacts = contacts.slice(0, 6);
  const recentSessions = sessions.slice(0, 4);
  const recentMessages = messages.slice(-8);
  const projectName = project?.name ?? "Selected project";

  return [
    {
      id: id("ev"),
      kind: "workspace",
      title: `${projectName} task health`,
      source: "Workspace tasks",
      excerpt: `${tasks.length} total tasks, ${openTasks.length} open tasks, ${highPriority.length} high-priority items.`,
      confidence: tasks.length > 0 ? 0.9 : 0.35,
      linkedClaimIds: ["claim-task-load", "claim-risk"],
      missing: tasks.length === 0,
    },
    {
      id: id("ev"),
      kind: "workspace",
      title: `${projectName} relationship context`,
      source: "Contacts",
      excerpt:
        recentContacts.length > 0
          ? `${recentContacts.length} active contacts available: ${recentContacts
              .map((contact) => `${contact.name} at ${contact.company}`)
              .join(", ")}.`
          : "No contact evidence is available for this project.",
      confidence: recentContacts.length > 0 ? 0.82 : 0.3,
      linkedClaimIds: ["claim-stakeholders"],
      missing: recentContacts.length === 0,
    },
    {
      id: id("ev"),
      kind: "workspace",
      title: "Recent workspace conversation",
      source: "Chat sessions",
      excerpt:
        recentMessages.length > 0 || recentSessions.length > 0
          ? `${recentSessions.length} sessions and ${recentMessages.length} recent messages can inform tone, known context, and open questions.`
          : "No recent chat messages were available for the selected project.",
      confidence: recentMessages.length > 0 || recentSessions.length > 0 ? 0.72 : 0.28,
      linkedClaimIds: ["claim-context"],
      missing: recentMessages.length === 0,
    },
  ];
}

export function buildVisualizations({
  tasks,
  contacts,
}: {
  tasks: Task[];
  contacts: Contact[];
}): VisualizationBlock[] {
  const taskCounts = countBy(tasks.map((task) => task.status));
  const priorityCounts = countBy(tasks.map((task) => task.priority ?? "unspecified"));

  return [
    {
      id: id("viz"),
      kind: "kpi",
      title: "Workspace signal",
      insight: "A compact read on operational volume and relationship coverage.",
      data: [
        { label: "Tasks", value: tasks.length },
        { label: "Open", value: tasks.filter((task) => task.status !== "done").length },
        { label: "Contacts", value: contacts.length },
      ],
    },
    {
      id: id("viz"),
      kind: "bar",
      title: "Task status mix",
      insight: "Shows where work is queued, active, or complete.",
      data: [
        { label: "Todo", value: taskCounts.todo ?? 0 },
        { label: "In progress", value: taskCounts.in_progress ?? 0 },
        { label: "Done", value: taskCounts.done ?? 0 },
      ],
    },
    {
      id: id("viz"),
      kind: "table",
      title: "Priority overview",
      insight: "Highlights operational pressure by priority tier.",
      data: [
        { priority: "High", count: priorityCounts.high ?? 0 },
        { priority: "Medium", count: priorityCounts.medium ?? 0 },
        { priority: "Low", count: priorityCounts.low ?? 0 },
        { priority: "Unspecified", count: priorityCounts.unspecified ?? 0 },
      ],
    },
  ];
}

export function createDraftArtifact({
  title,
  plan,
  evidence,
  visualizations,
  version,
  style,
}: {
  title: string;
  plan: PlanArtifact;
  evidence: EvidenceSource[];
  visualizations: VisualizationBlock[];
  version: number;
  style: BriefStyle;
}): DraftArtifact {
  const missing = evidence.filter((source) => source.missing);
  const strongEvidence = evidence.filter((source) => source.confidence >= 0.7);
  const styleLabel = briefStyleLabel(style);
  const briefIntent = detectBriefIntent(plan.objective, style);
  const designTemplate = selectDesignTemplate(briefIntent);
  const emphasis =
    style === "ops_report"
      ? "operational risk, ownership, and next actions"
      : style === "market_dossier"
        ? "market position, comparative signals, and opportunity areas"
        : "evidence-backed synthesis, implications, and decision support";
  const sections =
    style === "ops_report"
      ? [
          {
            id: id("section"),
            eyebrow: "Status",
            title: "What the workspace says right now",
            body: "The brief reads the current project through task volume, owner coverage, urgency, and unresolved execution gaps.",
            bullets: [
              "Prioritize open and high-priority work before adding external research.",
              "Use owner assignment as the primary path from insight to execution.",
              "Keep blockers visible until the board reflects the next action.",
            ],
          },
          {
            id: id("section"),
            eyebrow: "Risks",
            title: "Operational gaps to close",
            body: "The report identifies gaps that should become tasks or roadmap commitments after review.",
            bullets: [
              "Unsupported claims stay as assumptions.",
              "Missing owners remain unresolved until reviewed.",
              "Audit warnings become the first improvement loop.",
            ],
          },
        ]
      : style === "market_dossier"
        ? [
            {
              id: id("section"),
              eyebrow: "Landscape",
              title: "Positioning signals",
              body: "The dossier frames workspace evidence into a competitive readout that can later accept web and file sources.",
              bullets: [
                "Separate confirmed workspace facts from market assumptions.",
                "Capture differentiators as roadmap opportunities.",
                "Use comparison tables only when source coverage is sufficient.",
              ],
            },
            {
              id: id("section"),
              eyebrow: "Opportunity",
              title: "Where the team can move",
              body: "Recommendations are written as work candidates so they can be reviewed and applied to the board.",
              bullets: [
                "Turn priority insights into owner-backed tasks.",
                "Track long-horizon bets in the roadmap.",
                "Re-audit before publishing externally.",
              ],
            },
          ]
        : [
            {
              id: id("section"),
              eyebrow: "Synthesis",
              title: "Evidence-backed read",
              body: "The memo combines available workspace evidence into a decision-oriented narrative while keeping uncertainty visible.",
              bullets: [
                "Use tasks as the strongest current evidence source.",
                "Use contact coverage to frame stakeholder impact.",
                "Keep assumptions explicit until richer retrieval sources are connected.",
              ],
            },
            {
              id: id("section"),
              eyebrow: "Implications",
              title: "What this means for the project",
              body: "The output favors useful decisions over static dashboarding, then hands execution to the agent proposal flow.",
              bullets: [
                "Findings should become proposed tasks only after review.",
                "Daily ledger entries should show what changed.",
                "Roadmap items should preserve the long-term recommendation.",
              ],
            },
          ];

  const findings = [
    "Workspace tasks provide the clearest operational signal for the first brief.",
    "Contact coverage gives enough context to frame stakeholder impact.",
    missing.length > 0
      ? "Some source categories are incomplete and should stay labeled before publishing."
      : "No critical workspace source categories are missing for the v1 artifact.",
  ];
  const recommendations = [
    "Use the draft as an inspectable brief before expanding into external research.",
    "Keep assumptions visible until file, web, or database connectors are added.",
    "Publish only after the audit score reaches the readiness threshold.",
  ];

  return {
    id: id("draft"),
    version,
    style,
    briefIntent,
    designTemplate,
    title,
    summary: `${styleLabel} grounded in ${strongEvidence.length} workspace evidence groups. ${missing.length} data gap${missing.length === 1 ? "" : "s"} remain visible for review.`,
    thesis: `This artifact turns ${plan.objective} into ${emphasis}, then prepares safe agent handoff into tasks, board movement, and roadmap commitments.`,
    sections,
    citations: evidence.map((source, index) => ({
      label: `[${index + 1}] ${source.title}`,
      sourceId: source.id,
    })),
    findings,
    recommendations,
    visualizations,
    artifactSections: buildArtifactSections({
      title,
      plan,
      evidence,
      visualizations,
      findings,
      recommendations,
      styleLabel,
    }),
    createdAt: now(),
  };
}

export function auditWorkRun(run: Pick<WorkRun, "plan" | "evidence" | "drafts">): AuditResult {
  const latestDraft = run.drafts[run.drafts.length - 1];
  const supportedSources = run.evidence.filter((source) => !source.missing);
  const hasChart = latestDraft?.visualizations.some((viz) => viz.kind !== "table") ?? false;
  const hasTable = latestDraft?.visualizations.some((viz) => viz.kind === "table") ?? false;
  const planScore = run.plan.objective && run.plan.audience && run.plan.successCriteria.length >= 2 ? 92 : 58;
  const sourceScore = supportedSources.length >= 2 ? 88 : supportedSources.length === 1 ? 68 : 35;
  const claimScore = run.evidence.every((source) => source.linkedClaimIds.length > 0) ? 88 : 62;
  const chartScore = hasChart && hasTable ? 90 : hasChart || hasTable ? 72 : 40;
  const actionScore = latestDraft && latestDraft.recommendations.length >= 3 ? 88 : 60;
  const audienceScore = run.plan.audience ? 86 : 50;
  const exportScore = latestDraft ? 84 : 45;

  const checklist = [
    { id: "plan", label: "Plan completeness", score: planScore },
    { id: "sources", label: "Source coverage", score: sourceScore },
    { id: "claims", label: "Claim support", score: claimScore },
    { id: "charts", label: "Chart/data validity", score: chartScore },
    { id: "actions", label: "Actionability", score: actionScore },
    { id: "audience", label: "Audience fit", score: audienceScore },
    { id: "export", label: "Export readiness", score: exportScore },
  ].map((check) => ({
    ...check,
    status: check.score >= 85 ? "pass" : check.score >= 70 ? "warn" : "fail",
  })) satisfies AuditResult["checklist"];

  const score = Math.round(
    checklist.reduce((total, check) => total + check.score, 0) / checklist.length,
  );
  const failedChecks = checklist
    .filter((check) => check.status === "fail")
    .map((check) => check.label);
  const requiredFixes = [
    ...(run.plan.approved ? [] : ["Approve the plan before publishing."]),
    ...failedChecks.map((check) => `Improve ${check.toLowerCase()}.`),
  ];

  return {
    id: id("audit"),
    score,
    publishReady: score >= 85 && requiredFixes.length === 0,
    checklist,
    failedChecks,
    requiredFixes,
    stopReason:
      score >= 85 && requiredFixes.length === 0
        ? "Success: audit reached the publish threshold."
        : "Loop required: fix audit warnings before publishing.",
    createdAt: now(),
  };
}

export function createResearchBriefRun({
  prompt,
  project,
  tasks,
  contacts,
  sessions,
  messages,
  phase = "plan",
  approved = false,
}: {
  prompt: string;
  project?: Project;
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
  phase?: WorkLoopPhase;
  approved?: boolean;
}): WorkRun {
  const timestamp = now();
  const style = detectBriefStyle(prompt);
  const plan = { ...createPlanArtifact(prompt, project), approved };
  const evidence = buildEvidenceSources({ project, tasks, contacts, sessions, messages });
  const visualizations = buildVisualizations({ tasks, contacts });
  const title = titleFromPrompt(prompt);
  const draft = createDraftArtifact({
    title,
    plan,
    evidence,
    visualizations,
    version: 1,
    style,
  });
  const baseRun = {
    id: id("run"),
    projectId: project?.id ?? "proj-1",
    title,
    request: prompt,
    phase,
    status: statusForPhase(phase),
    plan,
    evidence,
    drafts: [draft],
    iteration: phaseOrder.indexOf(phase) <= 0 ? 0 : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    ...baseRun,
    audit: auditWorkRun(baseRun),
  };
}

export function updateRunPhase(run: WorkRun, phase: WorkLoopPhase): WorkRun {
  return {
    ...run,
    phase,
    status: statusForPhase(phase),
    iteration: phase === "iterate" ? run.iteration + 1 : run.iteration,
    updatedAt: now(),
  };
}

export function approvePlan(run: WorkRun): WorkRun {
  const nextRun = {
    ...run,
    phase: "iterate" as const,
    status: statusForPhase("iterate"),
    plan: {
      ...run.plan,
      approved: true,
      updatedAt: now(),
    },
    iteration: Math.max(1, run.iteration),
    updatedAt: now(),
  };

  return {
    ...nextRun,
    audit: auditWorkRun(nextRun),
  };
}

export function createNextDraft(run: WorkRun): WorkRun {
  const nextDraft = createDraftArtifact({
    title: run.title,
    plan: run.plan,
    evidence: run.evidence,
    visualizations: run.drafts[run.drafts.length - 1]?.visualizations ?? [],
    version: run.drafts.length + 1,
    style: run.drafts[run.drafts.length - 1]?.style ?? detectBriefStyle(run.request),
  });
  const nextRun = {
    ...run,
    drafts: [...run.drafts, nextDraft],
    phase: "audit" as const,
    status: statusForPhase("audit"),
    updatedAt: now(),
  };

  return {
    ...nextRun,
    audit: auditWorkRun(nextRun),
  };
}

function dueDateFromOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createAgentActionProposal({
  run,
  teamMembers,
}: {
  run: WorkRun;
  teamMembers: TeamMember[];
}): AgentActionProposal {
  const draft = run.drafts[run.drafts.length - 1];
  const fallbackOwners = teamMembers.map((member) => member.name);
  const ownerFor = (index: number) => fallbackOwners[index % Math.max(1, fallbackOwners.length)];
  const sourceFindings = draft?.findings.length ? draft.findings : run.plan.successCriteria;
  const proposedTasks = sourceFindings.slice(0, 4).map((finding, index) => {
    const owner = ownerFor(index);
    return {
      id: id("proposal-task"),
      title:
        index === 0
          ? `Convert brief insight into execution plan`
          : index === 1
            ? `Validate evidence gap for ${run.title}`
            : index === 2
              ? `Prepare stakeholder follow-up from brief`
              : `Track roadmap recommendation from brief`,
      description: `${finding} Source: ${run.title}.`,
      suggestedAssignee: owner,
      status: index === 0 ? "in_progress" : "todo",
      priority: index === 0 ? "high" : index === 1 ? "medium" : "low",
      dueDate: dueDateFromOffset(index + 1),
      sourceRunId: run.id,
      sourceDraftId: draft?.id ?? run.id,
      sourceFinding: finding,
      reason: `Agent proposed this from ${briefStyleLabel(draft?.style ?? "research_memo")} finding ${index + 1}.`,
      unresolvedOwner: !owner,
    } satisfies AgentActionProposal["proposedTasks"][number];
  });

  return {
    id: id("proposal"),
    projectId: run.projectId,
    runId: run.id,
    draftId: draft?.id ?? run.id,
    status: "needs_review",
    proposedTasks,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function createRoadmapItemsFromRun(run: WorkRun): RoadmapItem[] {
  const draft = run.drafts[run.drafts.length - 1];
  const recommendations = draft?.recommendations ?? [];
  return recommendations.slice(0, 3).map((recommendation, index) => ({
    id: id("roadmap"),
    projectId: run.projectId,
    runId: run.id,
    title:
      index === 0
        ? "Short-term execution clarity"
        : index === 1
          ? "Evidence maturity"
          : "Long-term intelligence workflow",
    description: recommendation,
    horizon: index === 0 ? "short_term" : "long_term",
    status: index === 0 ? "active" : "planned",
    owner: undefined,
    linkedTaskIds: [],
    createdAt: now(),
  }));
}
