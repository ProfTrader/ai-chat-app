/**
 * Deterministic metric engine for the executive insight artifact.
 *
 * Everything here is computed from data — never from the model. We either
 * aggregate a real ProjectDataset (prop-firm sample, imported CSV, etc.) into a
 * daily sales/overhead/net series, or fall back to a synthetic but realistic
 * "finance" series so any firm gets a working exec view out of the box.
 *
 * The verdict (healthy / watch / at-risk + runway) is derived from the series
 * with simple, explainable math: a linear trend on daily net, projected forward
 * against a cash reserve. The model may later rewrite the *headline* prose, but
 * the status and the numbers come from here.
 */

import type { DatasetColumn, ProjectDataset } from "@/types";
import type {
  InsightAltitude,
  InsightDraft,
  InsightKpi,
  InsightSeriesPoint,
  InsightVerdict,
  InsightVerdictStatus,
} from "@/lib/insight/client";

interface DailyPoint {
  date: string;
  sales: number;
  overhead: number;
  net: number;
}

const PROJECTION_DAYS = 14;
const WINDOW_DAYS = 14;

const SALES_ROLES = new Set(["revenue", "sales"]);
const OVERHEAD_ROLES = new Set(["discount"]); // prop-firm maps overhead → discount
const PAYOUT_ROLES = new Set(["payout"]);
const PROFIT_ROLES = new Set(["profit"]);

function isOverheadColumn(column: DatasetColumn): boolean {
  if (column.semanticRole && OVERHEAD_ROLES.has(column.semanticRole)) return true;
  return /overhead|cost|expense|opex|spend|payroll/i.test(`${column.key} ${column.label}`);
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Aggregate a dataset into a daily sales/overhead/net series, or null. */
function seriesFromDataset(dataset: ProjectDataset): DailyPoint[] | null {
  const dateCol =
    dataset.columns.find((c) => c.semanticRole === "date") ??
    dataset.columns.find((c) => c.type === "date");
  if (!dateCol) return null;

  const salesCols = dataset.columns.filter((c) => c.semanticRole && SALES_ROLES.has(c.semanticRole));
  if (salesCols.length === 0) return null;

  const overheadCols = dataset.columns.filter(isOverheadColumn);
  const payoutCols = dataset.columns.filter((c) => c.semanticRole && PAYOUT_ROLES.has(c.semanticRole));
  const profitCols = dataset.columns.filter((c) => c.semanticRole && PROFIT_ROLES.has(c.semanticRole));

  const byDate = new Map<string, { sales: number; overhead: number; payout: number; profit: number }>();
  for (const row of dataset.rows) {
    const rawDate = row[dateCol.key];
    if (rawDate == null) continue;
    const date = String(rawDate).slice(0, 10);
    const bucket = byDate.get(date) ?? { sales: 0, overhead: 0, payout: 0, profit: 0 };
    for (const c of salesCols) bucket.sales += num(row[c.key]);
    for (const c of overheadCols) bucket.overhead += num(row[c.key]);
    for (const c of payoutCols) bucket.payout += num(row[c.key]);
    for (const c of profitCols) bucket.profit += num(row[c.key]);
    byDate.set(date, bucket);
  }
  if (byDate.size === 0) return null;

  const hasProfit = profitCols.length > 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, b]) => ({
      date,
      sales: round2(b.sales),
      overhead: round2(b.overhead + b.payout),
      net: round2(hasProfit ? b.profit : b.sales - b.overhead - b.payout),
    }));
}

function isoDay(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Synthetic-but-plausible finance series for firms with no imported data yet:
 * sales ramp with weekday seasonality, overhead creeping up slightly faster, so
 * net stays positive but compresses — a realistic "healthy, keep an eye on it".
 */
export function buildFinanceSeries(days = 60, anchor = new Date()): DailyPoint[] {
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = isoDay(end, -i);
    const t = days - 1 - i; // 0 … days-1, increasing toward today
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekendDip = weekday === 0 || weekday === 6 ? 0.62 : 1;
    const wave = 1 + 0.08 * Math.sin(t / 3.3);
    const sales = round2((8800 + t * 46) * weekendDip * wave);
    const overhead = round2(6100 + t * 34 + (weekday === 1 ? 480 : 0));
    points.push({ date, sales, overhead, net: round2(sales - overhead) });
  }
  return points;
}

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function pctChange(current: number, previous: number): number | undefined {
  if (!Number.isFinite(previous) || previous === 0) return undefined;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function toneForDelta(deltaPct: number | undefined, higherIsBetter: boolean): InsightKpi["tone"] {
  if (deltaPct === undefined || Math.abs(deltaPct) < 0.5) return "neutral";
  const good = higherIsBetter ? deltaPct > 0 : deltaPct < 0;
  return good ? "positive" : "negative";
}

interface ComputeInput {
  dataset?: ProjectDataset | null;
  question: string;
  altitude: InsightAltitude;
  projectId?: string;
  sessionId?: string;
  projectName?: string;
  title?: string;
}

export function computeInsight(input: ComputeInput): InsightDraft {
  const fromDataset = input.dataset ? seriesFromDataset(input.dataset) : null;
  const source: "dataset" | "sample" = fromDataset ? "dataset" : "sample";
  const daily = fromDataset && fromDataset.length >= 2 ? fromDataset : buildFinanceSeries();
  const datasetName =
    source === "dataset" ? input.dataset?.name ?? "Project dataset" : "Finance model (sample)";

  // Cash reserve = ~1 month of average overhead, so "runway" is meaningful even
  // without a dedicated cash column.
  const avgOverhead = daily.reduce((s, d) => s + d.overhead, 0) / daily.length;
  const reserve = round2(Math.max(avgOverhead * 30, 1));

  let running = reserve;
  const series: InsightSeriesPoint[] = daily.map((d) => {
    running = round2(running + d.net);
    return { ...d, balance: running };
  });

  // Forward projection from the recent net trend.
  const recentNet = daily.slice(-WINDOW_DAYS).map((d) => d.net);
  const slope = linregSlope(recentNet);
  const lastNet = recentNet[recentNet.length - 1] ?? 0;
  const lastBalance = series[series.length - 1].balance;
  const asOf = daily[daily.length - 1].date;
  const anchor = new Date(`${asOf}T00:00:00Z`);

  let projBalance = lastBalance;
  let daysToNegative: number | undefined;
  for (let step = 1; step <= PROJECTION_DAYS; step += 1) {
    const projNet = lastNet + slope * step;
    projBalance = round2(projBalance + projNet);
    series.push({
      date: isoDay(anchor, step),
      sales: 0,
      overhead: 0,
      net: round2(projNet),
      balance: projBalance,
      projected: true,
    });
    if (daysToNegative === undefined && projBalance < 0) daysToNegative = step;
  }
  // Already underwater in the actuals.
  if (daysToNegative === undefined && lastBalance < 0) daysToNegative = 0;

  const verdict = buildVerdict({ daily, slope, daysToNegative, reserve, lastBalance });
  const kpis = buildKpis({ daily, verdict, daysToNegative });

  return {
    projectId: input.projectId,
    sessionId: input.sessionId,
    title: input.title ?? "Executive briefing",
    question: input.question,
    altitude: input.altitude,
    datasetName,
    asOf,
    kpis,
    series,
    verdict,
    source,
  };
}

function buildVerdict(args: {
  daily: DailyPoint[];
  slope: number;
  daysToNegative?: number;
  reserve: number;
  lastBalance: number;
}): InsightVerdict {
  const { daily, slope, daysToNegative } = args;
  const recent = daily.slice(-WINDOW_DAYS);
  const avgNet = recent.reduce((s, d) => s + d.net, 0) / recent.length;
  const lastSales = daily[daily.length - 1].sales;
  const lastOverhead = daily[daily.length - 1].overhead;
  const overheadRatio = lastSales > 0 ? Math.round((lastOverhead / lastSales) * 100) : 0;

  let status: InsightVerdictStatus;
  let headline: string;
  if (daysToNegative !== undefined && daysToNegative <= PROJECTION_DAYS) {
    status = "at_risk";
    headline =
      daysToNegative <= 0
        ? "Heads up — you're already running a negative balance."
        : `Heads up — at the current burn, cash trends negative in about ${daysToNegative} day${daysToNegative === 1 ? "" : "s"}.`;
  } else if (avgNet < 0 || slope < 0) {
    status = "watch";
    headline =
      avgNet < 0
        ? "Net is running negative day-to-day — cash is shrinking, though no immediate cliff."
        : "Holding positive, but net is trending down — worth keeping an eye on.";
  } else {
    status = "healthy";
    headline = "You're in good shape — net stays positive and the balance is growing.";
  }

  const drivers = [
    `Avg daily net ${avgNet >= 0 ? "+" : ""}$${Math.round(avgNet).toLocaleString()} over the last ${recent.length} days`,
    `Overhead is ${overheadRatio}% of sales`,
    slope >= 0 ? "Net trend is flat-to-up" : "Net trend is sloping down",
  ];

  return { status, headline, drivers, daysToNegative };
}

function buildKpis(args: {
  daily: DailyPoint[];
  verdict: InsightVerdict;
  daysToNegative?: number;
}): InsightKpi[] {
  const { daily, verdict, daysToNegative } = args;
  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2] ?? last;
  const sparkSales = daily.slice(-WINDOW_DAYS).map((d) => d.sales);
  const sparkOverhead = daily.slice(-WINDOW_DAYS).map((d) => d.overhead);
  const sparkNet = daily.slice(-WINDOW_DAYS).map((d) => d.net);

  const salesDelta = pctChange(last.sales, prev.sales);
  const overheadDelta = pctChange(last.overhead, prev.overhead);
  const netDelta = pctChange(last.net, prev.net);

  const runwayTone: InsightKpi["tone"] =
    verdict.status === "at_risk" ? "negative" : verdict.status === "watch" ? "warning" : "positive";

  return [
    {
      key: "sales",
      label: "Today's sales",
      value: last.sales,
      unit: "currency",
      deltaPct: salesDelta,
      spark: sparkSales,
      tone: toneForDelta(salesDelta, true),
      hint: "vs. prior day",
    },
    {
      key: "overhead",
      label: "Today's overhead",
      value: last.overhead,
      unit: "currency",
      deltaPct: overheadDelta,
      spark: sparkOverhead,
      tone: toneForDelta(overheadDelta, false),
      hint: "vs. prior day",
    },
    {
      key: "net",
      label: "Net today",
      value: last.net,
      unit: "currency",
      deltaPct: netDelta,
      spark: sparkNet,
      tone: last.net >= 0 ? "positive" : "negative",
      hint: "sales − overhead",
    },
    {
      key: "runway",
      label: "Cash runway",
      value: daysToNegative === undefined ? Infinity : daysToNegative,
      unit: "days",
      spark: daily.slice(-WINDOW_DAYS).map((_, i, arr) => arr.length - i),
      tone: runwayTone,
      hint: daysToNegative === undefined ? "no cliff in 14d projection" : "until balance < $0",
    },
  ];
}
