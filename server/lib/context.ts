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
      }),
    )
    .optional(),
});

export type ChatContext = z.infer<typeof chatContextSchema>;

export function buildSystemPrompt(context: ChatContext): string {
  const chips =
    context.contextChips.length > 0
      ? context.contextChips.map((c) => `- ${c.type}: ${c.label}`).join("\n")
      : "None";

  const tasks =
    context.tasksSummary && context.tasksSummary.length > 0
      ? context.tasksSummary
          .map((t) => `- ${t.identifier} [${t.status}] ${t.title}`)
          .join("\n")
      : "No open tasks provided.";

  const modeInstructions =
    context.composerMode === "plan"
      ? "Respond with structured plans, numbered steps, and clear rationale. Ask clarifying questions when scope is ambiguous."
      : "Respond concisely with actionable CRM guidance. Prefer bullet points and direct recommendations.";

  return `You are Nexus CRM, an AI assistant embedded in a customer relationship workspace.

Workspace: ${context.workspaceName ?? "Acme Corp"}
Project: ${context.projectName ?? "Unknown"} (${context.projectSlug ?? "n/a"})
Session: ${context.sessionId}
Composer mode: ${context.composerMode}

Context chips:
${chips}

Open tasks for this project:
${tasks}

Behavior:
- ${modeInstructions}
- Reference tasks, contacts, and project context when relevant.
- Stay professional and helpful for sales and project management workflows.`;
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
