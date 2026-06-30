import { z } from "zod";

export const chatContextSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
  projectName: z.string().optional(),
  projectSlug: z.string().optional(),
  workspaceName: z.string().optional(),
  composerMode: z.enum(["plan", "auto"]).default("auto"),
  contextChips: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(["task", "contact", "project", "file"]),
      }),
    )
    .default([]),
  tasksSummary: z
    .array(
      z.object({
        identifier: z.string(),
        title: z.string(),
        status: z.string(),
        description: z.string().optional(),
        priority: z.string().optional(),
        assignee: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .default([]),
  contactsSummary: z
    .array(
      z.object({
        name: z.string(),
        company: z.string(),
        notes: z.string().optional(),
        lastActivity: z.string().optional(),
      }),
    )
    .default([]),
  teamSummary: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        status: z.string().optional(),
      }),
    )
    .default([]),
  datasetsSummary: z
    .array(
      z.object({
        name: z.string(),
        domainId: z.string(),
        sourceKind: z.string(),
        rowCount: z.number(),
        columnCount: z.number(),
        columns: z.array(z.string()).default([]),
        source: z.string().optional(),
        notes: z.string().optional(),
        evidence: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  memoriesSummary: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        body: z.string(),
        confidence: z.number().optional(),
      }),
    )
    .default([]),
  researchSummary: z
    .array(
      z.object({
        kind: z.string(),
        entity: z.string(),
        title: z.string(),
        summary: z.string(),
        sourceUrl: z.string().optional(),
      }),
    )
    .default([]),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .default([]),
  businessProfile: z
    .object({
      businessName: z.string().optional(),
      summary: z.string().optional(),
      industry: z.string().optional(),
      businessModel: z.string().optional(),
      valueProposition: z.string().optional(),
      targetCustomers: z.array(z.string()).default([]),
    })
    .optional(),
  // Authoritative firm "soul" loaded server-side from the saved firm profile.
  firmMemory: z.string().optional(),
  firmName: z.string().optional(),
  // The agent's durable soul + memory files (soul-of-agent/firm, agents.md,
  // memory.md, session.md), pre-rendered as an authoritative prompt block.
  agentBrainFiles: z.string().optional(),
});

export type ChatContext = z.infer<typeof chatContextSchema>;

function truncate(value: string | undefined, maxLength = 220) {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function summarizeContextForActivity(context: ChatContext) {
  const rowCount = context.datasetsSummary.reduce(
    (total, dataset) => total + dataset.rowCount,
    0,
  );
  return [
    `${context.tasksSummary.length} tasks`,
    `${context.contactsSummary.length + context.teamSummary.length} people`,
    `${context.datasetsSummary.length} datasets`,
    `${rowCount.toLocaleString()} rows`,
    `${context.memoriesSummary.length} memories`,
    `${context.researchSummary.length} research docs`,
    `${context.contextChips.length} chips`,
  ].join(", ");
}

export function buildSystemPrompt(context: ChatContext): string {
  const chips =
    context.contextChips.length > 0
      ? context.contextChips.map((c) => `- ${c.type}: ${c.label}`).join("\n")
      : "None";

  const tasks =
    context.tasksSummary.length > 0
      ? context.tasksSummary
          .map((task) =>
            [
              `- ${task.identifier} [${task.status}] ${task.title}`,
              task.priority ? `priority=${task.priority}` : "",
              task.assignee ? `owner=${task.assignee}` : "",
              task.dueDate ? `due=${task.dueDate}` : "",
              task.description ? `notes=${truncate(task.description)}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
          )
          .join("\n")
      : "No open tasks provided.";

  const contacts =
    context.contactsSummary.length > 0
      ? context.contactsSummary
          .map((contact) =>
            [
              `- ${contact.name} (${contact.company})`,
              contact.lastActivity ? `last=${contact.lastActivity}` : "",
              contact.notes ? `notes=${truncate(contact.notes)}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
          )
          .join("\n")
      : "No external contacts provided.";

  const team =
    context.teamSummary.length > 0
      ? context.teamSummary
          .map((member) =>
            `- ${member.name} (${member.role}${member.status ? `, ${member.status}` : ""})`,
          )
          .join("\n")
      : "No internal team members provided.";

  const datasets =
    context.datasetsSummary.length > 0
      ? context.datasetsSummary
          .map(
            (dataset) => {
              const source = dataset.source ? ` | source=${truncate(dataset.source, 180)}` : "";
              const notes = dataset.notes ? ` | notes=${truncate(dataset.notes, 180)}` : "";
              const evidence = dataset.evidence.length
                ? `\n  Evidence rows:\n${dataset.evidence.map((row) => `  - ${truncate(row, 420)}`).join("\n")}`
                : "";
              return `- ${dataset.name} [${dataset.domainId}/${dataset.sourceKind}] ${dataset.rowCount.toLocaleString()} rows, ${dataset.columnCount} columns: ${dataset.columns.join(", ") || "columns not listed"}${source}${notes}${evidence}`;
            },
          )
          .join("\n")
      : "No project datasets provided.";

  const memories =
    context.memoriesSummary.length > 0
      ? context.memoriesSummary
          .map(
            (memory) =>
              `- ${memory.kind}: ${memory.title} | ${truncate(memory.body, 220)}${typeof memory.confidence === "number" ? ` | confidence=${memory.confidence.toFixed(2)}` : ""}`,
          )
          .join("\n")
      : "No durable project memories provided.";

  const research =
    context.researchSummary.length > 0
      ? context.researchSummary
          .map(
            (doc) =>
              `- [${doc.kind}/${doc.entity}] ${doc.title} — ${truncate(doc.summary, 280)}${doc.sourceUrl ? ` (src: ${doc.sourceUrl})` : ""}`,
          )
          .join("\n")
      : "No firm research provided.";

  const recentMessages =
    context.recentMessages.length > 0
      ? context.recentMessages
          .map((message) => `- ${message.role}: ${truncate(message.content, 260)}`)
          .join("\n")
      : "No recent messages provided.";

  const business = context.businessProfile;
  const businessSection = context.firmMemory?.trim()
    ? context.firmMemory.trim()
    : business
      ? [
          `Business: ${business.businessName ?? context.workspaceName ?? "the user's company"}`,
          business.industry ? `Industry: ${business.industry}` : "",
          business.businessModel ? `Model: ${business.businessModel}` : "",
          business.summary ? `Summary: ${truncate(business.summary, 320)}` : "",
          business.valueProposition ? `Value proposition: ${truncate(business.valueProposition, 200)}` : "",
          business.targetCustomers.length
            ? `Target customers: ${business.targetCustomers.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No firm profile saved yet. The user has not completed onboarding — if it would help, offer to set up their workspace so you can tailor your help.";

  const firmName =
    context.firmName ?? business?.businessName ?? context.workspaceName ?? "this firm";

  const modeInstructions =
    context.composerMode === "plan"
      ? "PLAN MODE is on — follow the PLAN MODE protocol below instead of executing the task."
      : "Respond concisely with actionable CRM guidance. Prefer bullet points and direct recommendations.";

  const planModeBlock =
    context.composerMode === "plan"
      ? `PLAN MODE IS ON — this overrides normal behavior. Your job is NOT to execute the task. Run a short, natural clarifying conversation, then signal that you are ready to draft a plan. You take no consequential action while Plan Mode is on.

How you talk:
- Ask ONE focused clarifying question per turn, in plain conversational prose, then stop and wait. Never stack multiple questions in one turn. Open with a short sentence framing WHY it matters, then ask.
- Each question builds on the previous answer — you are narrowing, not interrogating.
- Read before you ask: if the answer is already in the thread, the project snapshot, or earlier turns, use it — do not ask.
- 3–5 questions is a CEILING, not a target. The moment you understand the intent well enough to draft a credible plan, stop asking.

Optional quick replies — when your question has a few likely answers, you MAY append (after your prose, on its own line) a tiny JSON array of 2–4 short tappable suggestions:
[[nexus:chips]]["Short reply A","Short reply B","Short reply C"]​[[/nexus:chips]]
This is optional; omit it for open-ended questions. Never put your real question only inside the chips — always ask in prose first.

When you have enough to plan, write one short sentence saying you're ready to draft the plan, then append this sentinel on its own line and STOP:
[[nexus:plan-ready]]
Do NOT write the plan yourself — the system generates the structured, editable plan from the conversation when the operator chooses to. Nothing executes until the operator approves that plan.`
      : "";

  const planModeUiContract =
    context.composerMode === "plan"
      ? `PLAN MODE UI CONTRACT:
- Treat the user's initial request as the plan intent. Gather missing constraints; do not keep re-identifying the task.
- Ask exactly one question per assistant message. Never include Q1 and Q2 in the same response.
- When you offer multiple-choice answers, make the visible choices and [[nexus:chips]] array match exactly.
- Prefer 4 concrete choices when the question has clear alternatives. If you show A/B/C/D, the chips array must contain all 4 in the same order.
- Keep each chip under 120 characters.
- When enough information is collected, summarize the gathered answers and assumptions in 3-5 concise bullets before [[nexus:plan-ready]]. Then stop.`
      : "";

  const agentBrainFiles = context.agentBrainFiles?.trim();

  return `You are Dexter, the dedicated AI operator for ${firmName} inside Nexus CRM. You should feel like a sharp teammate in the room who knows this firm cold — not a generic assistant or ticket bot.

Workspace: ${context.workspaceName ?? "Acme Corp"}
Project: ${context.projectName ?? "Unknown"} (${context.projectSlug ?? "n/a"})
Session: ${context.sessionId}
Composer mode: ${context.composerMode}
${agentBrainFiles ? `\n${agentBrainFiles}\n` : ""}${planModeBlock ? `\n${planModeBlock}\n` : ""}${planModeUiContract ? `\n${planModeUiContract}\n` : ""}
FIRM MEMORY — the durable profile of ${firmName} you work for (always honor and reference this):
${businessSection}

Context chips:
${chips}

Project database snapshot:

Tasks:
${tasks}

Contacts:
${contacts}

Team:
${team}

Datasets:
${datasets}

Project memory:
${memories}

Firm research (competitive, product, support/tech, and help-desk intel gathered from the web — treat as evidence, cite the entity/source when you use it):
${research}

Recent conversation:
${recentMessages}

Behavior:
- ${modeInstructions}
- You work for ${firmName}. Ground recommendations in the FIRM MEMORY above — reference their industry, goals, target customers, and competitors by name when it makes your help sharper. Tailor examples and language to their business, not generic advice.
- When the user asks you to create a plan, strategy, campaign, or to build something and key specifics are missing (audience, goal, timeline, scope, channels, budget), ask one or two concrete clarifying questions grounded in ${firmName}'s business BEFORE laying out the plan. Do not present a predetermined plan or invent datasets, customers, metrics, competitors, tasks, or facts that are not in the firm memory or provided by the user.
- The workspace starts empty — there is no preloaded CRM data. Only reference tasks, contacts, datasets, or team members that actually appear in the project snapshot above; if a section says none are provided, say so rather than inventing entries.
- If the firm memory is missing or thin, briefly suggest completing or updating onboarding so you can personalize better.
- Voice: warm, present, direct, and lightly conversational. Sound like a sharp teammate who knows the workspace, not a generic assistant.
- When the user greets you, thanks you, checks in, jokes lightly, or says something welcoming, continue the conversation naturally. Acknowledge the tone, keep it brief, and make the room feel warm before offering to help.
- Do not force a work summary into casual greetings. If there is no explicit task, ask one useful open question or offer a grounded next step tied to the current project.
- When the user gives a task, switch cleanly into work mode. State what you will inspect or do next, then answer or propose the next action without extra ceremony.
- When the user asks what you are doing, explain your current reasoning path in plain language: what context you are reading, what decision you are making, and what you will do next.
- If the request is ambiguous, ask at most one focused clarifying question. If a reasonable default is safe, take it and say the assumption.
- Keep the personality consistent across short replies, brief planning, and longer analysis. Warmth should not dilute accuracy or governance.
- Ground answers in the project database snapshot first.
- When the question touches a competitor, product, pricing, platform/tech setup, or support/help-desk topic, draw on the FIRM RESEARCH above and cite the specific entity (and source URL when present). Do not invent figures that contradict it; if the research does not cover something, say so.
- Reuse durable project memory when it is relevant, especially explicit user preferences.
- If evidence is missing, say what is missing instead of inventing facts.
- When the user asks for analysis, briefly state what you inspected before recommendations.
- Reference tasks, contacts, datasets, team members, and project context when relevant.
- Stay professional and helpful for sales, operations, support, and project management workflows.`;
}

export function extractLatestUserMessage(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as {
      role?: string;
      parts?: Array<{ type?: string; text?: string }>;
      content?: string;
    };
    if (message.role !== "user") continue;

    if (Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n");
      if (text.trim()) return text.trim();
    }

    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }

  return "";
}
