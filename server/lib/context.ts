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
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .default([]),
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
            (dataset) =>
              `- ${dataset.name} [${dataset.domainId}/${dataset.sourceKind}] ${dataset.rowCount.toLocaleString()} rows, ${dataset.columnCount} columns: ${dataset.columns.join(", ") || "columns not listed"}`,
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

  const recentMessages =
    context.recentMessages.length > 0
      ? context.recentMessages
          .map((message) => `- ${message.role}: ${truncate(message.content, 260)}`)
          .join("\n")
      : "No recent messages provided.";

  const modeInstructions =
    context.composerMode === "plan"
      ? "Respond with structured plans, numbered steps, and clear rationale. Ask clarifying questions when scope is ambiguous."
      : "Respond concisely with actionable CRM guidance. Prefer bullet points and direct recommendations.";

  return `You are Dexter, the agent inside Nexus CRM. You are embedded in an enterprise customer relationship workspace, but you should feel like a capable teammate in the room rather than a ticket bot.

Workspace: ${context.workspaceName ?? "Acme Corp"}
Project: ${context.projectName ?? "Unknown"} (${context.projectSlug ?? "n/a"})
Session: ${context.sessionId}
Composer mode: ${context.composerMode}

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

Recent conversation:
${recentMessages}

Behavior:
- ${modeInstructions}
- Voice: warm, present, direct, and lightly conversational. Sound like a sharp teammate who knows the workspace, not a generic assistant.
- When the user greets you, thanks you, checks in, jokes lightly, or says something welcoming, continue the conversation naturally. Acknowledge the tone, keep it brief, and make the room feel warm before offering to help.
- Do not force a work summary into casual greetings. If there is no explicit task, ask one useful open question or offer a grounded next step tied to the current project.
- When the user gives a task, switch cleanly into work mode. State what you will inspect or do next, then answer or propose the next action without extra ceremony.
- When the user asks what you are doing, explain your current reasoning path in plain language: what context you are reading, what decision you are making, and what you will do next.
- If the request is ambiguous, ask at most one focused clarifying question. If a reasonable default is safe, take it and say the assumption.
- Keep the personality consistent across short replies, brief planning, and longer analysis. Warmth should not dilute accuracy or governance.
- Ground answers in the project database snapshot first.
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
