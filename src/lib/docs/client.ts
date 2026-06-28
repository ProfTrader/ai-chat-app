/**
 * Markdown "premise" documents the agent delivers to the canvas, plus the
 * follow-up delivery-preference choice. These power the Socratic flow:
 * clarify → premise doc on canvas → confirm what's right/off → choose delivery.
 */

export interface DocArtifactPayload {
  id: string;
  filename: string; // e.g. "go-to-market-premise.md"
  title: string;
  markdown: string;
}

export interface DeliveryPlanPayload {
  request: string;
  premise: string; // short summary of the premise, for context on submit
  options: string[];
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

export function encodeDocMarker(payload: DocArtifactPayload): string {
  return `[[nexus:doc:${enc(JSON.stringify(payload))}]]`;
}

export function parseDocMarker(text: string): {
  payload: DocArtifactPayload | null;
  cleanText: string;
} {
  const match = text.match(/\[\[nexus:doc:([^\]]+)\]\]/);
  if (!match) return { payload: null, cleanText: text };
  let payload: DocArtifactPayload | null = null;
  try {
    payload = JSON.parse(dec(match[1])) as DocArtifactPayload;
  } catch {
    payload = null;
  }
  return { payload, cleanText: text.replace(match[0], "").trim() };
}

export function encodeDeliveryMarker(payload: DeliveryPlanPayload): string {
  return `[[nexus:deliver:${enc(JSON.stringify(payload))}]]`;
}

export function parseDeliveryMarker(text: string): {
  payload: DeliveryPlanPayload | null;
  cleanText: string;
} {
  const match = text.match(/\[\[nexus:deliver:([^\]]+)\]\]/);
  if (!match) return { payload: null, cleanText: text };
  let payload: DeliveryPlanPayload | null = null;
  try {
    payload = JSON.parse(dec(match[1])) as DeliveryPlanPayload;
  } catch {
    payload = null;
  }
  return { payload, cleanText: text.replace(match[0], "").trim() };
}

export function slugifyFilename(value: string): string {
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "premise";
  return `${base}.md`;
}

/**
 * Turn the request + intake answers into a shared "premise" document — what we
 * understand we're doing and why — so the user and agent align on paper before
 * the work is produced.
 */
export function buildPremiseMarkdown(input: {
  request: string;
  answers: string;
  projectName?: string;
}): string {
  const { request, answers, projectName } = input;
  const answerLines = answers
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("-") ? line : `- ${line}`))
    .join("\n");

  return `# Premise${projectName ? ` — ${projectName}` : ""}

> A shared understanding of what we're doing, captured before producing the work.
> Tell me what's right and what's off, and I'll revise.

## The request
${request.trim()}

## What you told me
${answerLines || "_No specific answers — using best judgment._"}

## My understanding
Based on the above, here's how I'm framing this work:
${answerLines || "- (deriving from the request)"}

## Open questions
- Anything important I've assumed incorrectly above?
- Who is the final owner / approver?

## Next steps
Once the premise is right, choose how you want this delivered — tasks on the board,
a full brief, or keep this as a working document.
`;
}
