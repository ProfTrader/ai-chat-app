// Post-build pipeline: automations, scheduling, and deliverables.
//
// After a plan is approved ("Build plan"), Dexter chains three more stages in
// Auto mode: it derives an Automation rule per step, lays the steps onto a
// Schedule, then produces downloadable deliverables (.md doc + standalone HTML
// slide deck, with an optional .pptx export). Each stage persists lightweight
// records keyed to the plan and surfaces an artifact card via a marker that
// only carries the plan id (`[[nexus:automation:<planId>]]` etc.); the card
// reads the records back from the store, so nothing heavy is embedded in chat.

import type { PlanRecord, PlanStep, PlanStepTier } from "@/lib/plan/client";

export type AutomationStatus = "active" | "paused";

export interface AutomationRule {
  id: string;
  planId: string;
  projectId?: string;
  sessionId?: string;
  stepId: string;
  name: string;
  trigger: string;
  action: string;
  tier: PlanStepTier;
  status: AutomationStatus;
  createdAt: string;
}

export type ScheduleCadence = "once" | "daily" | "weekly" | "biweekly" | "monthly";

export type ScheduleStatus = "scheduled" | "paused";

export interface ScheduleEntry {
  id: string;
  planId: string;
  projectId?: string;
  stepId: string;
  automationId?: string;
  taskId?: string;
  title: string;
  cadence: ScheduleCadence;
  startDate: string; // ISO date (YYYY-MM-DD)
  status: ScheduleStatus;
  createdAt: string;
}

export const TIER_LABEL: Record<PlanStepTier, string> = {
  automatic: "Automatic",
  strict: "Strict",
  approval: "Approval",
};

export const CADENCE_LABEL: Record<ScheduleCadence, string> = {
  once: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

// ---- Derivations -----------------------------------------------------------

/** A short, title-cased automation name from a step action. */
function automationName(action: string): string {
  const trimmed = action.trim().replace(/\.$/, "");
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}…` : trimmed;
}

/** Pick a trigger phrasing based on the step's approval tier. */
function triggerForTier(tier: PlanStepTier, isFirst: boolean): string {
  if (tier === "approval") return "When a teammate approves the request";
  if (tier === "strict") {
    return isFirst
      ? "On run (verify inputs before executing)"
      : "When the previous step completes (verify before executing)";
  }
  return isFirst ? "On run" : "When the previous step completes";
}

export function deriveAutomationFields(step: PlanStep, index: number) {
  return {
    name: automationName(step.action),
    trigger: triggerForTier(step.tier, index === 0),
    action: step.detail?.trim() || step.action.trim(),
  };
}

/** Infer a recurrence cadence from the step text; defaults to one-time. */
export function deriveCadence(step: PlanStep): ScheduleCadence {
  const text = `${step.action} ${step.detail ?? ""}`.toLowerCase();
  if (/\b(daily|every day|each day|per day)\b/.test(text)) return "daily";
  if (/\b(bi-?weekly|every two weeks|every 2 weeks|fortnight)\b/.test(text)) return "biweekly";
  if (/\b(weekly|per week|each week|every week)\b/.test(text)) return "weekly";
  if (/\b(monthly|per month|each month|every month|\/month)\b/.test(text)) return "monthly";
  if (/\b(review|measure|monitor|track|report|metrics?)\b/.test(text)) return "monthly";
  if (/\b(publish|post|share|distribute|cadence)\b/.test(text)) return "weekly";
  return "once";
}

/** Stagger step start dates a week apart so the schedule reads as a sequence. */
export function deriveStartDate(index: number, base = new Date()): string {
  const date = new Date(base);
  date.setDate(date.getDate() + index * 7);
  return date.toISOString().slice(0, 10);
}

export function formatScheduleDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---- Markers (key on planId) ----------------------------------------------

const AUTOMATION_RE = /\[\[nexus:automation:([^\]]+)\]\]/;
const SCHEDULE_RE = /\[\[nexus:schedule:([^\]]+)\]\]/;
const DELIVERABLES_RE = /\[\[nexus:deliverables:([^\]]+)\]\]/;

export const encodeAutomationMarker = (planId: string) => `[[nexus:automation:${planId}]]`;
export const encodeScheduleMarker = (planId: string) => `[[nexus:schedule:${planId}]]`;
export const encodeDeliverablesMarker = (planId: string) => `[[nexus:deliverables:${planId}]]`;

function parseRefMarker(re: RegExp, text: string) {
  const match = text.match(re);
  if (!match) return { planId: null as string | null, cleanText: text };
  return { planId: match[1], cleanText: text.replace(match[0], "").trim() };
}

export const parseAutomationMarker = (text: string) => parseRefMarker(AUTOMATION_RE, text);
export const parseScheduleMarker = (text: string) => parseRefMarker(SCHEDULE_RE, text);
export const parseDeliverablesMarker = (text: string) => parseRefMarker(DELIVERABLES_RE, text);

export function stripAutomationMarkers(text: string): string {
  return text
    .replace(/\[\[nexus:automation:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:schedule:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:deliverables:[^\]]+\]\]/g, "")
    .trim();
}

// ---- Deliverable generators (deterministic, client-side) -------------------

export interface DeliverableInput {
  plan: PlanRecord;
  automations: AutomationRule[];
  schedule: ScheduleEntry[];
  firmName?: string;
}

export function deliverableSlug(plan: PlanRecord): string {
  return (
    plan.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "nexus-plan"
  );
}

export function buildPlanMarkdown({ plan, automations, schedule, firmName }: DeliverableInput): string {
  const scheduleByStep = new Map(schedule.map((entry) => [entry.stepId, entry]));
  const automationByStep = new Map(automations.map((rule) => [rule.stepId, rule]));
  const generated = new Date().toLocaleString();

  const stepBlocks = plan.steps
    .map((step, index) => {
      const rule = automationByStep.get(step.id);
      const slot = scheduleByStep.get(step.id);
      const lines = [
        `### ${index + 1}. ${step.action}`,
        "",
        step.detail ? `${step.detail}` : "_No additional detail._",
        "",
        `- **Tier:** ${TIER_LABEL[step.tier]}`,
      ];
      if (rule) lines.push(`- **Automation:** ${rule.trigger} → ${rule.action}`);
      if (slot) {
        lines.push(
          `- **Schedule:** ${CADENCE_LABEL[slot.cadence]} · starts ${formatScheduleDate(slot.startDate)}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const scheduleTable = schedule.length
    ? [
        "| Step | Cadence | Starts |",
        "| --- | --- | --- |",
        ...schedule.map(
          (entry) =>
            `| ${entry.title} | ${CADENCE_LABEL[entry.cadence]} | ${formatScheduleDate(entry.startDate)} |`,
        ),
      ].join("\n")
    : "_No scheduled work._";

  const assumptions = plan.assumptions.length
    ? plan.assumptions.map((item) => `- ${item}`).join("\n")
    : "_No assumptions recorded._";

  return `# ${plan.title}

${plan.summary}

> Generated by Nexus${firmName ? ` for ${firmName}` : ""} on ${generated}.

## Assumptions
${assumptions}

## Plan steps
${stepBlocks}

## Schedule
${scheduleTable}

## Automations
${
    automations.length
      ? automations
          .map(
            (rule) =>
              `- **${rule.name}** (${TIER_LABEL[rule.tier]}, ${rule.status}) — ${rule.trigger} → ${rule.action}`,
          )
          .join("\n")
      : "_No automations configured._"
  }
`;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A standalone, self-contained HTML slide deck: title slide, overview, one
 * slide per step (with its automation + schedule), a schedule slide, and a
 * close. Keyboard-navigable (arrows / space), branded with the Nexus dark
 * theme, and print-friendly (each slide a page) so it doubles as a PDF export.
 */
export function buildPlanDeckHtml({ plan, automations, schedule, firmName }: DeliverableInput): string {
  const scheduleByStep = new Map(schedule.map((entry) => [entry.stepId, entry]));
  const automationByStep = new Map(automations.map((rule) => [rule.stepId, rule]));
  const generated = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const titleSlide = `<section class="slide slide-title">
    <div class="eyebrow">${esc(firmName ?? "Nexus")} · Launch plan</div>
    <h1>${esc(plan.title)}</h1>
    <p class="lede">${esc(plan.summary)}</p>
    <div class="meta">${esc(plan.steps.length)} steps · ${esc(schedule.length)} scheduled · ${esc(generated)}</div>
  </section>`;

  const overviewSlide = `<section class="slide">
    <div class="kicker">Overview</div>
    <h2>What we're assuming</h2>
    <ul class="bullets">
      ${
        plan.assumptions.length
          ? plan.assumptions.map((item) => `<li>${esc(item)}</li>`).join("")
          : "<li>Best-judgment defaults — no explicit assumptions recorded.</li>"
      }
    </ul>
  </section>`;

  const stepSlides = plan.steps
    .map((step, index) => {
      const rule = automationByStep.get(step.id);
      const slot = scheduleByStep.get(step.id);
      return `<section class="slide">
        <div class="kicker">Step ${index + 1} of ${plan.steps.length}</div>
        <h2>${esc(step.action)}</h2>
        ${step.detail ? `<p class="lede">${esc(step.detail)}</p>` : ""}
        <div class="chips">
          <span class="chip chip-${step.tier}">${esc(TIER_LABEL[step.tier])}</span>
          ${slot ? `<span class="chip">${esc(CADENCE_LABEL[slot.cadence])} · ${esc(formatScheduleDate(slot.startDate))}</span>` : ""}
        </div>
        ${
          rule
            ? `<div class="automation"><span class="auto-label">Automation</span><div>${esc(rule.trigger)} <span class="arrow">→</span> ${esc(rule.action)}</div></div>`
            : ""
        }
      </section>`;
    })
    .join("");

  const scheduleSlide = `<section class="slide">
    <div class="kicker">Schedule</div>
    <h2>Rollout timeline</h2>
    <table class="schedule">
      <thead><tr><th>Step</th><th>Cadence</th><th>Starts</th></tr></thead>
      <tbody>
        ${
          schedule.length
            ? schedule
                .map(
                  (entry) =>
                    `<tr><td>${esc(entry.title)}</td><td>${esc(CADENCE_LABEL[entry.cadence])}</td><td>${esc(formatScheduleDate(entry.startDate))}</td></tr>`,
                )
                .join("")
            : `<tr><td colspan="3" class="muted">No scheduled work.</td></tr>`
        }
      </tbody>
    </table>
  </section>`;

  const closeSlide = `<section class="slide slide-title">
    <div class="eyebrow">${esc(firmName ?? "Nexus")}</div>
    <h1>Ready to ship</h1>
    <p class="lede">${esc(automations.length)} automations configured · ${esc(schedule.length)} steps scheduled.</p>
    <div class="meta">Generated by Nexus · ${esc(generated)}</div>
  </section>`;

  const slides = [titleSlide, overviewSlide, stepSlides, scheduleSlide, closeSlide].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(plan.title)} — Presentation</title>
<style>
  :root { color-scheme: dark; --ink:#f7fbff; --muted:#9aa3ad; --line:rgba(233,240,245,.14); --active:#03dc5d; --gold:#d5a132; --danger:#ff6b57; --panel:#0c1014; --base:#050506; }
  * { box-sizing:border-box; }
  html, body { margin:0; height:100%; }
  body { background:radial-gradient(circle at 78% 0%, rgba(3,220,93,.14), transparent 30%), linear-gradient(180deg,#08080a,var(--base) 60%,#020304); color:var(--ink); font-family:"Mona Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .deck { height:100vh; display:flex; align-items:center; justify-content:center; padding:40px; }
  .slide { display:none; width:min(960px,100%); min-height:540px; flex-direction:column; justify-content:center; gap:18px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(180deg,rgba(17,17,20,.96),rgba(12,16,20,.96)); padding:56px; box-shadow:0 30px 90px rgba(0,0,0,.4); }
  .slide.active { display:flex; }
  .slide-title { align-items:flex-start; }
  .eyebrow,.kicker { color:var(--active); font-size:13px; font-weight:750; letter-spacing:.1em; text-transform:uppercase; }
  h1 { margin:0; font-size:52px; line-height:1.04; letter-spacing:-.01em; }
  h2 { margin:0; font-size:34px; line-height:1.12; }
  .lede { margin:0; color:var(--muted); font-size:20px; line-height:1.5; max-width:760px; }
  .meta { color:var(--muted); font-size:14px; }
  .bullets { margin:6px 0 0; padding-left:22px; font-size:20px; line-height:1.7; }
  .bullets li { margin:6px 0; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .chip { border:1px solid var(--line); border-radius:999px; padding:6px 14px; font-size:14px; color:var(--muted); background:rgba(255,255,255,.04); }
  .chip-automatic { border-color:rgba(3,220,93,.4); color:var(--active); background:rgba(3,220,93,.08); }
  .chip-strict { border-color:rgba(213,161,50,.45); color:var(--gold); background:rgba(213,161,50,.08); }
  .chip-approval { border-color:rgba(255,107,87,.45); color:var(--danger); background:rgba(255,107,87,.08); }
  .automation { margin-top:14px; border:1px solid var(--line); border-radius:12px; background:rgba(255,255,255,.035); padding:16px 18px; font-size:17px; }
  .auto-label { display:block; color:var(--active); font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px; }
  .arrow { color:var(--active); padding:0 6px; }
  table.schedule { width:100%; border-collapse:collapse; margin-top:10px; font-size:17px; }
  table.schedule th, table.schedule td { text-align:left; padding:12px 14px; border-bottom:1px solid var(--line); }
  table.schedule th { color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:.06em; }
  .muted { color:var(--muted); }
  .hud { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:14px; border:1px solid var(--line); border-radius:999px; background:rgba(5,5,6,.85); padding:8px 14px; backdrop-filter:blur(14px); }
  .hud button { cursor:pointer; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.05); color:var(--ink); padding:6px 12px; font:inherit; font-size:13px; }
  .hud .count { color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; min-width:46px; text-align:center; }
  @media print {
    body { background:#fff; color:#111; }
    .deck { display:block; height:auto; padding:0; }
    .slide { display:flex !important; break-after:page; box-shadow:none; border:none; background:#fff; color:#111; min-height:96vh; }
    .hud { display:none; }
    .lede,.meta,.muted,.bullets,.chip,.auto-label { color:#333; }
  }
</style>
</head>
<body>
  <div class="deck">${slides}</div>
  <div class="hud">
    <button type="button" data-prev>‹ Prev</button>
    <span class="count" data-count></span>
    <button type="button" data-next>Next ›</button>
    <button type="button" onclick="window.print()">Export PDF</button>
  </div>
  <script>
    (function () {
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var i = 0;
      var count = document.querySelector('[data-count]');
      function show(n) {
        i = Math.max(0, Math.min(slides.length - 1, n));
        slides.forEach(function (s, idx) { s.classList.toggle('active', idx === i); });
        if (count) count.textContent = (i + 1) + ' / ' + slides.length;
      }
      document.querySelector('[data-next]').addEventListener('click', function () { show(i + 1); });
      document.querySelector('[data-prev]').addEventListener('click', function () { show(i - 1); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(i + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
        if (e.key === 'Home') show(0);
        if (e.key === 'End') show(slides.length - 1);
      });
      show(0);
    })();
  </script>
</body>
</html>`;
}
