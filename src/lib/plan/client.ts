// Plan Mode v2 contract.
//
// Intake is conversational: Dexter asks clarifying questions as plain prose and
// MAY append two tiny, optional markers — quick-reply `chips` and a `plan-ready`
// sentinel. The plan itself is NOT hand-written by the model; it is generated
// deterministically by POST /api/plan and stored as a PlanRecord, then embedded
// in an assistant message as a `[[nexus:plan:<id>]]` reference so it renders as
// an editable artifact and survives reload.

export type PlanStepTier = "automatic" | "strict" | "approval";

export interface PlanStep {
  id: string;
  action: string;
  tier: PlanStepTier;
  detail?: string;
  done?: boolean;
}

export type PlanStatus = "draft" | "approved" | "discarded";

export interface PlanRecord {
  id: string;
  projectId?: string;
  sessionId?: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  assumptions: string[];
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

/** Shape returned by /api/plan (steps carry no id; the store assigns them). */
export interface PlanDraft {
  title: string;
  summary: string;
  steps: Array<{ action: string; tier: PlanStepTier; detail?: string }>;
  assumptions: string[];
}

interface PlanResponse {
  provider: string;
  model: string;
  plan: PlanDraft;
}

function findBalancedJsonObject(content: string) {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return content.slice(start, index + 1);
  }
  return null;
}

function parsePlanResponseBody(raw: string) {
  try {
    return JSON.parse(raw) as PlanResponse & { code?: string; message?: string };
  } catch {
    const json = findBalancedJsonObject(raw);
    if (!json) throw new Error(raw || "Plan endpoint returned an invalid response.");
    return JSON.parse(json) as PlanResponse & { code?: string; message?: string };
  }
}

export async function requestPlan(input: {
  request: string;
  projectName?: string;
  conversation?: string;
  model?: string;
}): Promise<PlanDraft> {
  const response = await fetch("/api/plan", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = parsePlanResponseBody(await response.text());
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Failed to draft plan"), { code: data.code });
  }
  return (data as PlanResponse).plan;
}

const STEP_TIERS: PlanStepTier[] = ["automatic", "strict", "approval"];

export function normalizePlanTier(value: unknown): PlanStepTier {
  return STEP_TIERS.includes(value as PlanStepTier) ? (value as PlanStepTier) : "automatic";
}

// ---- Markers ---------------------------------------------------------------

const CHIPS_RE = /\[\[nexus:chips\]\]([\s\S]*?)\[\[\/nexus:chips\]\]/;
const PLAN_READY_RE = /\[\[nexus:plan-ready\]\]/;
const PLAN_REF_RE = /\[\[nexus:plan:([^\]]+)\]\]/;

function firstQuestionSection(text: string) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /\b(?:Q\d+|Question\s+\d+)\b/i.test(line) && line.includes("?"));
  if (start === -1) return text;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\b(?:Q\d+|Question\s+\d+)\b/i.test(line) && line.includes("?")) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

/** Optional quick-reply suggestions the model may attach after a question. */
export function parseChipsMarker(text: string): { chips: string[]; cleanText: string } {
  const match = text.match(CHIPS_RE);
  if (!match) return { chips: [], cleanText: text };
  const cleanText = text.replace(match[0], "").trim();
  // Slice the JSON array out of the fenced content, tolerating any stray
  // wrapping/whitespace/zero-width characters the model may add.
  const inner = match[1];
  const start = inner.indexOf("[");
  const end = inner.lastIndexOf("]");
  if (start === -1 || end <= start) return { chips: [], cleanText };
  try {
    const parsed = JSON.parse(inner.slice(start, end + 1));
    const chips = Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim()).filter(Boolean).slice(0, 4)
      : [];
    return { chips, cleanText };
  } catch {
    return { chips: [], cleanText };
  }
}

/**
 * Fallback when the model asks a multiple-choice question in plain prose instead
 * of emitting a chips marker: pull the enumerated options out of the message so
 * we can still render tappable quick replies. Conservative on purpose — only
 * fires when the message clearly poses a choice (a "?" plus 2–6 short items).
 */
export function extractChoicesFromMessage(text: string): string[] {
  const clean = firstQuestionSection(stripPlanMarkers(text));
  if (!clean.includes("?")) return [];

  const choices: string[] = [];
  for (const rawLine of clean.split("\n")) {
    const line = rawLine.trim();
    // "1." / "1)" / "-" / "*" / "•" / "a)" style list markers.
    const match = line.match(/^(?:[-*•]\s*)?(?:\*\*)?\s*(?:\d+|[A-Da-d])\s*[.)]\s*(?:\*\*)?\s*(.+)$/);
    if (!match) continue;
    let choice = match[1].trim();
    // Keep the concise label: cut a trailing " — explanation" / ": detail".
    choice = choice.split(/\s+(?:[-—–]|\?)\s+/)[0].split(/:\s+/)[0].trim();
    // Strip surrounding markdown emphasis / quotes and trailing punctuation.
    choice = choice
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .replace(/^[*_"'“”]+|[*_"'“”]+$/g, "")
      .replace(/[.;,]+$/, "")
      .trim();
    if (choice.length >= 1 && choice.length <= 120) choices.push(choice);
  }

  if (choices.length < 2 || choices.length > 6) return [];
  return choices;
}

/** Sentinel the model emits when intake is done and a plan can be generated. */
export function parsePlanReadyMarker(text: string): { ready: boolean; cleanText: string } {
  if (!PLAN_READY_RE.test(text)) return { ready: false, cleanText: text };
  return { ready: true, cleanText: text.replace(PLAN_READY_RE, "").trim() };
}

export function encodePlanMarker(planId: string): string {
  return `[[nexus:plan:${planId}]]`;
}

export function parsePlanMarker(text: string): { planId: string | null; cleanText: string } {
  const match = text.match(PLAN_REF_RE);
  if (!match) return { planId: null, cleanText: text };
  return { planId: match[1], cleanText: text.replace(match[0], "").trim() };
}

/** Remove all plan-related markers so only operator-facing prose remains. */
export function stripPlanMarkers(text: string): string {
  return text
    .replace(CHIPS_RE, "")
    .replace(/\[\[nexus:chips\]\][\s\S]*$/g, "") // dangling opener mid-stream
    .replace(PLAN_READY_RE, "")
    .replace(/\[\[nexus:plan:[^\]]+\]\]/g, "")
    .trim();
}
