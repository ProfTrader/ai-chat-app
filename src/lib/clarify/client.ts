export interface ClarifyQuestion {
  id: string;
  prompt: string;
  options: string[];
  multi: boolean;
}

export interface ClarifyPlan {
  intro: string;
  questions: ClarifyQuestion[];
  cta: string;
}

interface ClarifyResponse {
  provider: string;
  model: string;
  plan: ClarifyPlan;
}

export async function requestClarify(instruction: string, projectName?: string): Promise<ClarifyPlan> {
  const response = await fetch("/api/clarify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, projectName }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Failed to build questions"), { code: data.code });
  }
  return (data as ClarifyResponse).plan;
}

export interface ClarifyMarkerPayload {
  request: string;
  plan: ClarifyPlan;
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

export function encodeClarifyMarker(payload: ClarifyMarkerPayload): string {
  return `[[nexus:ask:${enc(JSON.stringify(payload))}]]`;
}

export function parseClarifyMarker(text: string): {
  payload: ClarifyMarkerPayload | null;
  cleanText: string;
} {
  const match = text.match(/\[\[nexus:ask:([^\]]+)\]\]/);
  if (!match) return { payload: null, cleanText: text };
  let payload: ClarifyMarkerPayload | null = null;
  try {
    payload = JSON.parse(dec(match[1])) as ClarifyMarkerPayload;
  } catch {
    payload = null;
  }
  return { payload, cleanText: text.replace(match[0], "").trim() };
}
