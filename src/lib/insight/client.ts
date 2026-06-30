/**
 * Executive "insight" deliverable — the inline, chart-driven answer to a
 * higher-up's question ("today's sales?", "are we at risk of going negative?").
 *
 * Unlike the plan flow (a *build* artifact), this is an *analytical* artifact:
 * numbers are computed deterministically from project data (see compute.ts) and
 * only the verdict prose is model-written. It renders INLINE in chat as KPIs +
 * charts, with .md/.html/.pptx export demoted to a side action.
 *
 * Marker is id-reference style — the heavy record lives in data-store and the
 * card reads it back, so nothing bulky is embedded in the chat message.
 */

export type InsightAltitude = "exec" | "manager" | "ic";

export type InsightVerdictStatus = "healthy" | "watch" | "at_risk";

export type KpiUnit = "currency" | "days" | "percent" | "number";

export type KpiTone = "positive" | "negative" | "neutral" | "warning";

export interface InsightKpi {
  key: string; // "sales" | "overhead" | "net" | "runway"
  label: string;
  value: number;
  unit: KpiUnit;
  /** Percentage change vs the prior comparable period, when computable. */
  deltaPct?: number;
  /** Recent values powering the sparkline (oldest → newest). */
  spark: number[];
  tone: KpiTone;
  hint?: string;
}

export interface InsightSeriesPoint {
  date: string; // YYYY-MM-DD
  sales: number;
  overhead: number;
  net: number; // sales − overhead (− payout); a day's contribution
  balance: number; // running cash position (cumulative net + reserve)
  /** True for the forward projection tail beyond `asOf`. */
  projected?: boolean;
}

export interface InsightVerdict {
  status: InsightVerdictStatus;
  /** One-line plain-English answer to the question. */
  headline: string;
  /** Optional longer model-written context. */
  detail?: string;
  /** Short bullet drivers behind the verdict. */
  drivers: string[];
  /** Days until the projected balance crosses zero, when applicable. */
  daysToNegative?: number;
}

export interface InsightRecord {
  id: string;
  projectId?: string;
  sessionId?: string;
  title: string;
  /** The exec question this insight answers. */
  question: string;
  altitude: InsightAltitude;
  datasetName: string;
  /** Date the metrics are current as of (YYYY-MM-DD). */
  asOf: string;
  kpis: InsightKpi[];
  series: InsightSeriesPoint[];
  verdict: InsightVerdict;
  source: "dataset" | "sample";
  createdAt: string;
  updatedAt: string;
}

/** Shape produced by compute.ts before the store assigns id/timestamps. */
export type InsightDraft = Omit<InsightRecord, "id" | "createdAt" | "updatedAt">;

// ---- Marker (id-reference) -------------------------------------------------

const INSIGHT_RE = /\[\[nexus:insight:([^\]]+)\]\]/;

export const encodeInsightMarker = (insightId: string) => `[[nexus:insight:${insightId}]]`;

export function parseInsightMarker(text: string): {
  insightId: string | null;
  cleanText: string;
} {
  const match = text.match(INSIGHT_RE);
  if (!match) return { insightId: null, cleanText: text };
  return { insightId: match[1], cleanText: text.replace(match[0], "").trim() };
}

export function stripInsightMarkers(text: string): string {
  return text.replace(/\[\[nexus:insight:[^\]]+\]\]/g, "").trim();
}

// ---- Intent routing --------------------------------------------------------

/**
 * Detect a standalone "tell me how the business is doing" question — the
 * answer-first exec path. Conservative: needs a metric noun and either a
 * question or a status/risk framing, so it doesn't swallow "create a plan".
 */
export function shouldRouteToInsight(text: string): boolean {
  const input = text.toLowerCase();
  // Financial-risk phrasing is inherently an insight question, even without an
  // explicit metric noun ("are we at risk of going negative?").
  const financialRisk =
    /\b(go(?:ing)?\s+negative|in the red|going under|run(?:ning)?\s+out of (?:cash|money|runway)|cash\s*flow|short ?fall|losing money|underwater|insolven\w*|bankrupt\w*|break[\s-]?even|burn ?rate|runway)\b/.test(
      input,
    );
  if (financialRisk) return true;

  const metric =
    /\b(sales?|revenue|overhead|cost|costs|expenses?|margin|profit|net|cash|burn|payout|p&l|pnl|numbers?|kpis?|metrics?|performance|bottom line|top line)\b/.test(
      input,
    );
  if (!metric) return false;
  const askingStatus =
    /\b(how (?:are|is|much|many|'re)|what(?:'s| is| are)|are we|am i|do we|where (?:are|do)|today'?s?|this (?:week|month|quarter)|so far|right now|currently|show me|give me|trend|looking)\b/.test(
      input,
    );
  return askingStatus || input.includes("?");
}

// ---- LLM verdict (grounded, authoritative) ---------------------------------

export function toneForStatus(status: InsightVerdictStatus): KpiTone {
  return status === "at_risk" ? "negative" : status === "watch" ? "warning" : "positive";
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

/**
 * Ask the model to read the REAL daily numbers and decide the verdict — status,
 * headline, drivers, detail. This is what makes the insight a live LLM analysis
 * rather than a templated answer: the deterministic verdict from compute.ts is
 * passed only as `computedStatus` evidence and used as a fallback if the call
 * fails. Charts and KPIs always stay on the real computed numbers.
 */
export async function requestInsightVerdict(input: {
  question: string;
  altitude: InsightAltitude;
  projectName?: string;
  model?: string;
  draft: InsightDraft;
}): Promise<InsightVerdict | null> {
  const { draft } = input;
  const recent = draft.series.filter((p) => !p.projected).slice(-21);
  if (recent.length === 0) return null;
  const round = (n: number) => Math.round(n);
  const totalSales = recent.reduce((s, p) => s + p.sales, 0);
  const totalOverhead = recent.reduce((s, p) => s + p.overhead, 0);
  const totalNet = recent.reduce((s, p) => s + p.net, 0);

  const body = {
    question: input.question,
    altitude: input.altitude,
    projectName: input.projectName,
    datasetName: draft.datasetName,
    asOf: draft.asOf,
    computedStatus: draft.verdict.status,
    daysToNegative: draft.verdict.daysToNegative ?? null,
    kpis: draft.kpis.map((k) => ({
      label: k.label,
      value: Number.isFinite(k.value) ? k.value : null,
      unit: k.unit,
      deltaPct: k.deltaPct,
    })),
    window: {
      days: recent.length,
      totalSales: round(totalSales),
      totalOverhead: round(totalOverhead),
      totalNet: round(totalNet),
      overheadPctOfSales: totalSales > 0 ? Math.round((totalOverhead / totalSales) * 100) : null,
    },
    series: recent.map((p) => ({
      date: p.date,
      sales: round(p.sales),
      overhead: round(p.overhead),
      net: round(p.net),
    })),
    model: input.model,
  };

  try {
    const response = await fetch("/api/insight", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    if (!response.ok) return null;
    let data: {
      source?: string;
      verdict?: { status?: string; headline?: string; detail?: string; drivers?: unknown[] };
    };
    try {
      data = JSON.parse(raw);
    } catch {
      const json = findBalancedJsonObject(raw);
      if (!json) return null;
      data = JSON.parse(json);
    }
    // The model didn't produce a usable verdict — keep the caller's grounded
    // deterministic verdict (which has drivers) instead of the bare fallback.
    if (data.source !== "llm") return null;
    const v = data.verdict;
    if (!v || typeof v.headline !== "string" || !v.headline.trim()) return null;
    const status: InsightVerdictStatus =
      v.status === "healthy" || v.status === "watch" || v.status === "at_risk"
        ? v.status
        : draft.verdict.status;
    return {
      status,
      headline: v.headline.trim().slice(0, 200),
      detail: (v.detail ?? "").toString().trim().slice(0, 600),
      drivers: Array.isArray(v.drivers)
        ? v.drivers.map((d) => String(d).trim()).filter(Boolean).slice(0, 4).map((d) => d.slice(0, 160))
        : [],
      daysToNegative: draft.verdict.daysToNegative,
    };
  } catch {
    return null;
  }
}

// ---- Formatting helpers (shared by the artifact + exports) -----------------

export function formatKpiValue(value: number, unit: KpiUnit): string {
  if (unit === "currency") {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  if (unit === "percent") return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  if (unit === "days") return Number.isFinite(value) ? `${Math.round(value)}d` : "∞";
  return value.toLocaleString();
}

export const VERDICT_LABEL: Record<InsightVerdictStatus, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
};
