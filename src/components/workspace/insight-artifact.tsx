import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  Minus,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import {
  formatKpiValue,
  VERDICT_LABEL,
  type InsightKpi,
  type InsightRecord,
  type InsightVerdictStatus,
} from "@/lib/insight/client";
import { buildInsightHtml, buildInsightMarkdown, insightSlug } from "@/lib/insight/export";

// Brand palette aligned with the exported HTML deck so inline + export match.
const COLOR = {
  active: "#03dc5d",
  gold: "#d5a132",
  danger: "#ff6b57",
  muted: "#9aa3ad",
  grid: "rgba(233,240,245,.10)",
};

const STATUS_STYLE: Record<
  InsightVerdictStatus,
  { pill: string; icon: typeof ShieldCheck; accent: string }
> = {
  healthy: { pill: "border-active/40 bg-active-soft text-active", icon: ShieldCheck, accent: COLOR.active },
  watch: { pill: "border-warning/40 bg-warning/10 text-warning", icon: TrendingUp, accent: COLOR.gold },
  at_risk: { pill: "border-destructive/40 bg-destructive/10 text-destructive", icon: ShieldAlert, accent: COLOR.danger },
};

const TONE_TEXT: Record<InsightKpi["tone"], string> = {
  positive: "text-active",
  negative: "text-destructive",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function DeltaPill({ kpi }: { kpi: InsightKpi }) {
  if (kpi.deltaPct === undefined) {
    return kpi.hint ? <span className="text-[10px] text-muted-foreground">{kpi.hint}</span> : null;
  }
  const Icon = kpi.deltaPct > 0 ? ArrowUpRight : kpi.deltaPct < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", TONE_TEXT[kpi.tone])}>
      <Icon className="size-3" />
      {Math.abs(kpi.deltaPct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ kpi }: { kpi: InsightKpi }) {
  const sparkData = useMemo(() => kpi.spark.map((value, i) => ({ i, value })), [kpi.spark]);
  const sparkColor =
    kpi.tone === "negative" ? COLOR.danger : kpi.tone === "warning" ? COLOR.gold : COLOR.active;
  const gradientId = `spark-${kpi.key}`;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-background px-3 py-2.5">
      <span className="truncate text-[11px] font-medium text-muted-foreground">{kpi.label}</span>
      <span className="text-lg font-semibold leading-tight tabular-nums">
        {formatKpiValue(kpi.value, kpi.unit)}
      </span>
      <div className="flex items-center justify-between gap-1">
        <DeltaPill kpi={kpi} />
        <div className="h-6 w-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  currency = true,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  currency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-medium">{formatDay(String(label))}</div>
      {payload
        .filter((entry) => entry.value != null)
        .map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {currency ? compactCurrency(Number(entry.value)) : Number(entry.value).toLocaleString()}
            </span>
          </div>
        ))}
    </div>
  );
}

export function InsightArtifact({ insightId }: { insightId: string }) {
  const insight = useDataStore((s) => s.getInsight(insightId)) as InsightRecord | undefined;
  const { send } = useChatSession();
  const defaultView: "revenue" | "cash" =
    insight?.verdict.status === "at_risk" || insight?.verdict.status === "watch" ? "cash" : "revenue";
  const [view, setView] = useState<"revenue" | "cash">(defaultView);

  const revenueData = useMemo(
    () => (insight ? insight.series.filter((p) => !p.projected).slice(-30) : []),
    [insight],
  );
  const cashData = useMemo(() => {
    if (!insight) return [];
    const firstProjected = insight.series.findIndex((p) => p.projected);
    return insight.series.slice(-44).map((p, i, arr) => {
      const globalIndex = insight.series.length - arr.length + i;
      const isLastActual = globalIndex === firstProjected - 1;
      return {
        date: p.date,
        actual: p.projected ? null : p.balance,
        projected: p.projected || isLastActual ? p.balance : null,
      };
    });
  }, [insight]);

  if (!insight) return null;
  const status = STATUS_STYLE[insight.verdict.status];
  const StatusIcon = status.icon;

  const refine = (label: string, instruction: string) => {
    void send(instruction);
    return label;
  };

  const exportMd = () =>
    downloadBlob(new Blob([buildInsightMarkdown(insight)], { type: "text/markdown" }), `${insightSlug(insight)}.md`);
  const exportHtml = () =>
    downloadBlob(
      new Blob([buildInsightHtml(insight)], { type: "text/html;charset=utf-8" }),
      `${insightSlug(insight)}.html`,
    );

  return (
    <div className="w-full max-w-[min(42rem,94%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <TrendingUp className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{insight.title}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {insight.datasetName} · as of {formatDay(insight.asOf)}
            {insight.altitude === "exec" ? " · exec view" : insight.altitude === "manager" ? " · manager view" : " · team view"}
          </span>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", status.pill)}>
          <StatusIcon className="size-3.5" />
          {VERDICT_LABEL[insight.verdict.status]}
        </span>
      </div>

      {/* Verdict */}
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium leading-snug">{insight.verdict.headline}</p>
        {insight.verdict.detail ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.verdict.detail}</p>
        ) : null}
        {insight.verdict.drivers.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {insight.verdict.drivers.map((driver, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Check className="mt-0.5 size-3 shrink-0 text-active" />
                {driver}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        {insight.kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      {/* Chart */}
      <div className="px-3 pb-3">
        <div className="mb-2 flex items-center gap-1">
          {(["revenue", "cash"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                view === option ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "revenue" ? "Revenue vs overhead" : "Cash trajectory"}
            </button>
          ))}
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {view === "revenue" ? (
              <AreaChart data={revenueData} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="g-sales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR.active} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLOR.active} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLOR.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 10, fill: COLOR.muted }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={compactCurrency}
                  tick={{ fontSize: 10, fill: COLOR.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  name="Sales"
                  dataKey="sales"
                  stroke={COLOR.active}
                  strokeWidth={2}
                  fill="url(#g-sales)"
                  isAnimationActive={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  name="Overhead"
                  dataKey="overhead"
                  stroke={COLOR.gold}
                  strokeWidth={1.5}
                  fill="transparent"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={cashData} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLOR.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 10, fill: COLOR.muted }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={compactCurrency}
                  tick={{ fontSize: 10, fill: COLOR.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke={COLOR.danger} strokeDasharray="4 4" strokeOpacity={0.7} />
                <Line
                  type="monotone"
                  name="Cash balance"
                  dataKey="actual"
                  stroke={status.accent}
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  name="Projected"
                  dataKey="projected"
                  stroke={status.accent}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  isAnimationActive={false}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer: refine + export */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-muted/20 px-3 py-2.5">
        <span className="mr-1 text-[11px] text-muted-foreground">Refine:</span>
        <RefineChip onClick={() => refine("This week", `Show me this insight for the last 7 days instead: ${insight.question}`)}>
          Last 7 days
        </RefineChip>
        <RefineChip onClick={() => refine("By team", `Break the same numbers down by team / desk: ${insight.question}`)}>
          Break down by team
        </RefineChip>
        <RefineChip onClick={() => refine("Why", `Explain what's driving this — why are the numbers where they are?`)}>
          What's driving this?
        </RefineChip>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="xs" variant="outline" aria-label="Export insight" />}
            >
              <Download className="size-3.5" /> Export
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportMd}>
                <FileText className="size-3.5" /> Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportHtml}>
                <FileText className="size-3.5" /> Web page (.html)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function RefineChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
