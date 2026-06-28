export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

interface EmailDraftResponse {
  provider: string;
  model: string;
  email: EmailDraft;
}

export async function draftEmail(instruction: string): Promise<EmailDraft> {
  const response = await fetch("/api/email/draft", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Failed to draft email"), { code: data.code });
  }
  return (data as EmailDraftResponse).email;
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

/** Embed an email draft inside an assistant message for inline rendering. */
export function encodeEmailMarker(email: EmailDraft): string {
  return `[[nexus:email:${enc(JSON.stringify(email))}]]`;
}

export function parseEmailMarker(text: string): { email: EmailDraft | null; cleanText: string } {
  const match = text.match(/\[\[nexus:email:([^\]]+)\]\]/);
  if (!match) return { email: null, cleanText: text };
  let email: EmailDraft | null = null;
  try {
    email = JSON.parse(dec(match[1])) as EmailDraft;
  } catch {
    email = null;
  }
  return { email, cleanText: text.replace(match[0], "").trim() };
}
