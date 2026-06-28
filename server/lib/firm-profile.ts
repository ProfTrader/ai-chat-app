import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".data");
const jsonFile = path.join(dataDir, "firm-profile.json");
const htmlFile = path.join(dataDir, "firm-profile.html");

export interface FirmAnswers {
  businessName: string;
  description?: string;
  domain?: string;
  goals?: string;
  socials?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    other?: string;
  };
}

export interface FirmProfile {
  summary: string;
  industry: string;
  businessModel: string;
  targetCustomers: string[];
  valueProposition: string;
  competitors: string[];
  opportunities: string[];
  suggestedProjects: { name: string; description: string }[];
  suggestedTasks: { title: string; priority: "high" | "medium" | "low" }[];
  crmSetupTips: string[];
}

export interface FirmProfileRecord {
  version: number;
  savedAt: string;
  provider?: string;
  model?: string;
  answers: FirmAnswers;
  profile: FirmProfile;
}

export async function saveFirmProfile(
  input: Omit<FirmProfileRecord, "version" | "savedAt">,
): Promise<FirmProfileRecord> {
  const record: FirmProfileRecord = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...input,
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(jsonFile, JSON.stringify(record, null, 2), "utf8");
  await writeFile(htmlFile, renderFirmProfileHtml(record), "utf8");
  return record;
}

export async function loadFirmProfile(): Promise<FirmProfileRecord | null> {
  try {
    const raw = await readFile(jsonFile, "utf8");
    return JSON.parse(raw) as FirmProfileRecord;
  } catch {
    return null;
  }
}

export async function loadFirmProfileHtml(): Promise<string | null> {
  try {
    return await readFile(htmlFile, "utf8");
  } catch {
    const record = await loadFirmProfile();
    return record ? renderFirmProfileHtml(record) : null;
  }
}

/**
 * Compact, prompt-ready summary of the firm — the "soul of the firm" the agent
 * carries into every conversation.
 */
export function firmProfileToPromptBlock(record: FirmProfileRecord): string {
  const { answers, profile } = record;
  const socials = answers.socials
    ? Object.entries(answers.socials)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  return [
    `Name: ${answers.businessName}`,
    `Industry: ${profile.industry}`,
    `Business model: ${profile.businessModel}`,
    `What they do: ${profile.summary}`,
    `Value proposition: ${profile.valueProposition}`,
    answers.goals ? `Stated goals: ${answers.goals}` : "",
    profile.targetCustomers.length ? `Target customers: ${profile.targetCustomers.join("; ")}` : "",
    profile.competitors.length ? `Competitors: ${profile.competitors.join("; ")}` : "",
    profile.opportunities.length ? `Opportunities/risks: ${profile.opportunities.join("; ")}` : "",
    profile.crmSetupTips.length ? `CRM approach: ${profile.crmSetupTips.join("; ")}` : "",
    socials ? `Links: ${socials}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(items: string[]): string {
  if (!items.length) return "<p class=\"muted\">None recorded.</p>";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

export function renderFirmProfileHtml(record: FirmProfileRecord): string {
  const { answers, profile } = record;
  const socials = answers.socials
    ? Object.entries(answers.socials).filter(([, v]) => v && String(v).trim())
    : [];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(answers.businessName)} — Firm Profile</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 20px;
    background: #0d0d0d; color: #ededed;
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; justify-content: center;
  }
  .doc { width: 100%; max-width: 760px; }
  .mark { display:inline-grid; place-items:center; width:40px; height:40px; border-radius:12px;
    background:#fafafa; color:#0d0d0d; font-weight:700; font-size:14px; }
  header { display:flex; align-items:center; gap:14px; margin-bottom:8px; }
  h1 { font-size: 26px; margin: 0; letter-spacing:-0.02em; }
  .sub { color:#9a9a9a; font-size:13px; margin: 2px 0 0; }
  .badges { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 28px; }
  .badge { border:1px solid #2a2a2a; background:#161616; border-radius:999px; padding:5px 12px; font-size:13px; color:#cfcfcf; }
  section { border-top:1px solid #1e1e1e; padding:22px 0; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#8a8a8a; margin:0 0 12px; font-weight:600; }
  p { margin:0 0 10px; }
  .lead { font-size:16px; color:#f2f2f2; }
  .quote { font-style:italic; color:#b9b9b9; border-left:2px solid #333; padding-left:14px; }
  ul { margin:0; padding-left:18px; }
  li { margin:4px 0; }
  .muted { color:#7a7a7a; }
  .grid { display:grid; gap:10px; }
  .card { border:1px solid #1e1e1e; background:#141414; border-radius:12px; padding:12px 14px; }
  .card .name { font-weight:600; }
  .card .desc { color:#9a9a9a; font-size:13px; }
  .task { display:flex; align-items:center; gap:10px; padding:6px 0; }
  .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
  .high{background:#e5484d}.medium{background:#e2a336}.low{background:#6a6a6a}
  .pri { margin-left:auto; font-size:11px; text-transform:uppercase; color:#8a8a8a; letter-spacing:0.06em; }
  a { color:#8ab4ff; }
  footer { margin-top:8px; color:#6a6a6a; font-size:12px; }
</style>
</head>
<body>
  <div class="doc">
    <header>
      <span class="mark">NX</span>
      <div>
        <h1>${escapeHtml(answers.businessName)}</h1>
        <p class="sub">Firm profile · the operating memory for your Nexus agent</p>
      </div>
    </header>

    <div class="badges">
      <span class="badge">${escapeHtml(profile.industry)}</span>
      <span class="badge">${escapeHtml(profile.businessModel)}</span>
      ${answers.domain ? `<span class="badge">${escapeHtml(answers.domain)}</span>` : ""}
    </div>

    <section>
      <h2>Overview</h2>
      <p class="lead">${escapeHtml(profile.summary)}</p>
      <p class="quote">"${escapeHtml(profile.valueProposition)}"</p>
    </section>

    ${answers.goals ? `<section><h2>Stated goals</h2><p>${escapeHtml(answers.goals)}</p></section>` : ""}

    <section><h2>Target customers</h2>${list(profile.targetCustomers)}</section>
    <section><h2>Competitors</h2>${list(profile.competitors)}</section>
    <section><h2>Opportunities &amp; risks</h2>${list(profile.opportunities)}</section>

    <section>
      <h2>Suggested projects</h2>
      <div class="grid">
        ${profile.suggestedProjects
          .map(
            (p) =>
              `<div class="card"><div class="name">${escapeHtml(p.name)}</div><div class="desc">${escapeHtml(p.description)}</div></div>`,
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>First tasks</h2>
      ${profile.suggestedTasks
        .map(
          (t) =>
            `<div class="task"><span class="dot ${t.priority}"></span><span>${escapeHtml(t.title)}</span><span class="pri">${escapeHtml(t.priority)}</span></div>`,
        )
        .join("")}
    </section>

    <section><h2>How this firm should use the CRM</h2>${list(profile.crmSetupTips)}</section>

    ${
      socials.length
        ? `<section><h2>Links</h2><ul>${socials
            .map(([k, v]) => `<li>${escapeHtml(k)}: <a href="${escapeHtml(String(v))}">${escapeHtml(String(v))}</a></li>`)
            .join("")}</ul></section>`
        : ""
    }

    <footer>Saved ${escapeHtml(record.savedAt)}${record.model ? ` · researched with ${escapeHtml(record.model)}` : ""}</footer>
  </div>
</body>
</html>`;
}
