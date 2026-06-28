import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadFirmProfile, type FirmProfileRecord } from "./firm-profile.js";

/**
 * The agent's persistent "soul" + memory files — real markdown the user can read
 * and edit, and the agent reads on every turn and updates on important changes.
 * Inspired by the Hermes-agent pattern (SOUL.md / MEMORY.md / AGENTS.md): identity
 * is separated from learned facts is separated from procedure.
 */
const dataDir = path.join(process.cwd(), ".data", "agent");
const metaFile = path.join(dataDir, ".meta.json");

export type AgentFileName =
  | "soul-of-firm.md"
  | "soul-of-agent.md"
  | "agents.md"
  | "memory.md"
  | "session.md";

export type AgentFileUpdatedBy = "user" | "agent" | "system";

export interface AgentFileMeta {
  updatedBy: AgentFileUpdatedBy;
  updatedAt: string;
}

export interface AgentFile extends AgentFileMeta {
  name: AgentFileName;
  title: string;
  description: string;
  content: string;
}

interface AgentFileDef {
  name: AgentFileName;
  title: string;
  description: string;
  /** Whether the agent injects this file as authoritative context every turn. */
  inject: boolean;
  seed: (record: FirmProfileRecord | null) => string;
}

const FILE_DEFS: AgentFileDef[] = [
  {
    name: "soul-of-agent.md",
    title: "Soul of the agent",
    description:
      "Who Dexter is — identity, values, voice, and hard boundaries. Honored above default behavior.",
    inject: true,
    seed: () => SOUL_OF_AGENT_SEED,
  },
  {
    name: "soul-of-firm.md",
    title: "Soul of the firm",
    description:
      "The firm's identity, mission, voice, and operating principles. The agent grounds everything in this.",
    inject: true,
    seed: (record) => seedSoulOfFirm(record),
  },
  {
    name: "agents.md",
    title: "Operating manual (agents.md)",
    description:
      "How the agent works: skills, the clarify→deliver workflow, governance, and house rules.",
    inject: true,
    seed: () => AGENTS_SEED,
  },
  {
    name: "memory.md",
    title: "Long-term memory",
    description:
      "Durable facts and preferences learned over time. The agent appends here on important changes.",
    inject: true,
    seed: () => MEMORY_SEED,
  },
  {
    name: "session.md",
    title: "Session notes",
    description:
      "A running log of the latest sessions — what was asked, decided, and delivered.",
    inject: true,
    seed: () => SESSION_SEED,
  },
];

const FILE_BY_NAME = new Map(FILE_DEFS.map((def) => [def.name, def]));

export function isAgentFileName(value: string): value is AgentFileName {
  return FILE_BY_NAME.has(value as AgentFileName);
}

async function readMeta(): Promise<Record<string, AgentFileMeta>> {
  try {
    return JSON.parse(await readFile(metaFile, "utf8")) as Record<string, AgentFileMeta>;
  } catch {
    return {};
  }
}

async function writeMeta(meta: Record<string, AgentFileMeta>): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(metaFile, JSON.stringify(meta, null, 2), "utf8");
}

/** Create the directory and seed any missing files. Safe to call repeatedly. */
export async function ensureAgentFiles(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const record = await loadFirmProfile();
  const meta = await readMeta();
  let metaChanged = false;

  for (const def of FILE_DEFS) {
    const file = path.join(dataDir, def.name);
    try {
      await stat(file);
    } catch {
      await writeFile(file, def.seed(record), "utf8");
      meta[def.name] = { updatedBy: "system", updatedAt: new Date().toISOString() };
      metaChanged = true;
    }
  }

  if (metaChanged) await writeMeta(meta);
}

export async function listAgentFiles(): Promise<AgentFile[]> {
  await ensureAgentFiles();
  const meta = await readMeta();
  const files: AgentFile[] = [];
  for (const def of FILE_DEFS) {
    let content = "";
    try {
      content = await readFile(path.join(dataDir, def.name), "utf8");
    } catch {
      content = def.seed(await loadFirmProfile());
    }
    const m = meta[def.name] ?? { updatedBy: "system" as const, updatedAt: new Date().toISOString() };
    files.push({
      name: def.name,
      title: def.title,
      description: def.description,
      content,
      updatedBy: m.updatedBy,
      updatedAt: m.updatedAt,
    });
  }
  return files;
}

export async function readAgentFile(name: AgentFileName): Promise<AgentFile | null> {
  const all = await listAgentFiles();
  return all.find((f) => f.name === name) ?? null;
}

export async function writeAgentFile(
  name: AgentFileName,
  content: string,
  updatedBy: AgentFileUpdatedBy,
): Promise<AgentFile> {
  await ensureAgentFiles();
  await writeFile(path.join(dataDir, name), content, "utf8");
  const meta = await readMeta();
  meta[name] = { updatedBy, updatedAt: new Date().toISOString() };
  await writeMeta(meta);
  const def = FILE_BY_NAME.get(name)!;
  return {
    name,
    title: def.title,
    description: def.description,
    content,
    updatedBy,
    updatedAt: meta[name].updatedAt,
  };
}

/**
 * Append a timestamped note to an evolving file (memory.md / session.md). Keeps a
 * bounded number of entries so the file — and the prompt — never bloats.
 */
export async function appendAgentNote(
  name: AgentFileName,
  heading: string,
  body: string,
  updatedBy: AgentFileUpdatedBy = "agent",
  options: { maxEntries?: number } = {},
): Promise<AgentFile> {
  const existing = (await readAgentFile(name))?.content ?? "";
  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n## ${date} — ${heading.trim()}\n${body.trim()}\n`;
  let next = `${existing.trimEnd()}\n${entry}`;

  // Compact: keep only the most recent N "## " entries to bound growth.
  const maxEntries = options.maxEntries ?? 40;
  const parts = next.split(/\n(?=## )/);
  if (parts.length > maxEntries + 1) {
    const header = parts[0];
    const kept = parts.slice(parts.length - maxEntries);
    next = [header, ...kept].join("\n");
  }
  return writeAgentFile(name, next, updatedBy);
}

/**
 * Refresh soul-of-firm.md from the saved firm profile after onboarding — unless
 * the user has hand-edited it (we never clobber their edits).
 */
export async function syncSoulOfFirmFromProfile(): Promise<void> {
  await ensureAgentFiles();
  const meta = await readMeta();
  if (meta["soul-of-firm.md"]?.updatedBy === "user") return;
  const record = await loadFirmProfile();
  await writeAgentFile("soul-of-firm.md", seedSoulOfFirm(record), "system");
}

/**
 * The agent files rendered as authoritative prompt sections — the "superpower"
 * context the agent carries every turn.
 */
export async function agentFilesPromptBlock(): Promise<string> {
  const files = await listAgentFiles();
  const sections: string[] = [];
  for (const file of files) {
    const def = FILE_BY_NAME.get(file.name);
    if (!def?.inject) continue;
    const content = file.content.trim();
    if (!content) continue;
    sections.push(`### ${file.title} (${file.name})\n${content}`);
  }
  if (!sections.length) return "";
  return [
    "AGENT BRAIN FILES — these are your durable soul + memory. Treat them as authoritative:",
    "honor the soul files as your identity, ground work in the firm soul, follow the operating",
    "manual, and reuse long-term memory + session notes (especially explicit user preferences).",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

const SOUL_OF_AGENT_SEED = `# Soul of the agent

## Identity
- **Name:** Dexter
- **Role:** The dedicated AI operator inside Nexus CRM for the firm described in \`soul-of-firm.md\`.
- **Orientation:** A sharp teammate in the room who knows this firm cold — not a generic assistant or a ticket bot.

## Operating principles
1. **Ground everything in the firm.** Reference the firm's industry, goals, customers, and competitors by name. Never invent datasets, customers, metrics, or facts.
2. **Extract the premise, don't interrogate.** Not everyone is patient. Pull intent from what's already said, take safe defaults out loud, and ask at most one or two focused questions only when a real decision is missing.
3. **Remember preferences.** When the user reveals how they like things (tone, format, delivery, cadence), capture it to long-term memory and honor it next time without being told again.
4. **Be transparent about your thinking.** When asked what you're doing, explain in plain language what you're reading, deciding, and doing next.
5. **Deliver, then confirm.** Produce a concrete artifact, then ask Socratically what's right and what's off — refine from the user's reaction rather than a long upfront spec.

## Voice
Warm, present, direct, lightly conversational. Acknowledge tone before getting to work. Keep personality consistent across short replies and long analysis; warmth never dilutes accuracy.

## Hard boundaries
- Never fabricate facts, sources, or workspace data. If evidence is missing, say what's missing.
- Approval-gate real changes (briefs, tasks-to-board, outreach) — propose, let the user decide.
- Keep governance intact even when being friendly.
`;

const AGENTS_SEED = `# Operating manual (agents.md)

## What I do
I run the CRM workspace conversationally: answer grounded questions, draft briefs and emails,
propose tasks, and turn a rough ask into an executable plan.

## Core workflow: clarify → premise → deliver → confirm
1. **Clarify** — for a build/plan request with missing specifics, ask a few quick multiple-choice questions grounded in the firm.
2. **Premise doc** — capture the request + answers + my understanding as a \`.md\` document delivered to the canvas, so we're aligned on paper before doing the work.
3. **Confirm (Socratic)** — ask what's right and what's off; refine the premise from the reaction.
4. **Deliver** — once aligned, produce the chosen output (tasks to board, HTML brief, email…) and ask how they want it delivered.
5. **Remember** — record durable preferences and a session note.

## Skills
- **Project context retrieval** — build a compact context pack from chats, tasks, team, datasets, briefs, and memory.
- **Brief artifact delivery** — produce a branded HTML brief on the canvas (approval-gated).
- **Task proposal** — break a request into actionable, owned tasks for the board.
- **Premise documents** — write a \`.md\` doc to the canvas capturing intent + decisions.
- **Memory reflection** — keep \`memory.md\` and \`session.md\` current.

## House rules
- Propose before mutating. Cite what's known; mark gaps as gaps.
- Prefer the user's stated preferences (see \`memory.md\`) over defaults.
`;

const MEMORY_SEED = `# Long-term memory

Durable facts and preferences I've learned. I append here when something is worth
remembering across sessions; I keep it pruned so it stays sharp.

## Preferences
_None recorded yet._

## Durable facts
_None recorded yet._
`;

const SESSION_SEED = `# Session notes

A running log of recent sessions — what was asked, decided, and delivered. Newest first.

_No sessions recorded yet._
`;

function seedSoulOfFirm(record: FirmProfileRecord | null): string {
  if (!record) {
    return `# Soul of the firm

_Onboarding isn't complete yet, so the firm's soul is thin._ Complete onboarding (or edit
this file directly) to give the agent the firm's identity, mission, voice, and operating
principles. The agent grounds everything it does in this file.

## Identity
- **Name:** _the firm_
- **What we do:** _describe the business_
- **Industry:** _e.g. SaaS, services_

## Mission & values
- _Why we exist; what we reliably deliver; what we prioritize when rules conflict._

## Voice
- _How we sound to customers._

## Operating principles
- _Defaults the agent should follow on our behalf._
`;
  }

  const { answers, profile } = record;
  const lines = (items: string[]) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : "- _None recorded._";

  return `# Soul of the firm

## Identity
- **Name:** ${answers.businessName}
- **Industry:** ${profile.industry}
- **Business model:** ${profile.businessModel}
- **What we do:** ${profile.summary}

## Value proposition
${profile.valueProposition}

${answers.goals ? `## Stated goals\n${answers.goals}\n` : ""}
## Target customers
${lines(profile.targetCustomers)}

## Competitors
${lines(profile.competitors)}

## Opportunities & risks
${lines(profile.opportunities)}

## How we use the CRM
${lines(profile.crmSetupTips)}

_Seeded from onboarding. Edit freely — the agent treats this as the firm's living soul._
`;
}
