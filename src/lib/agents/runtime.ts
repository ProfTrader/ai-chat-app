import type {
  AgentDomainId,
  AgentMemoryNote,
  AgentRun,
  ArtifactChart,
  ArtifactClaim,
  ArtifactSection,
  ArtifactTable,
  AgentStep,
  AgentToolDefinition,
  Contact,
  DatasetColumn,
  DatasetColumnType,
  DatasetRowValue,
  DatasetSemanticRole,
  DraftArtifact,
  EvidenceSource,
  Insight,
  MetricDefinition,
  Message,
  Project,
  ProjectDataset,
  Session,
  Task,
  ToolInvocation,
  VisualizationBlock,
  WorkRun,
} from "@/types";
import {
  auditWorkRun,
  createPlanArtifact,
  detectBriefStyle,
} from "@/lib/artifacts/brief-loop";

type DataRow = Record<string, DatasetRowValue>;

interface AgentRuntimeInput {
  prompt: string;
  project?: Project;
  datasets: ProjectDataset[];
  tasks: Task[];
  contacts: Contact[];
  sessions: Session[];
  messages: Message[];
  model?: string;
}

interface ToolResult {
  id: string;
  toolId: string;
  toolName: string;
  inputSummary: string;
  outputSummary: string;
  evidenceId: string;
  durationMs: number;
}

interface SegmentResult {
  label: string;
  count: number;
  total: number;
  average: number;
}

interface TrendResult {
  label: string;
  value: number;
}

interface ProfileResult {
  rowCount: number;
  numericTotals: Array<{ label: string; total: number; average: number }>;
  categoryCounts: Array<{ label: string; value: number }>;
  missing: string[];
}

const domainLabels: Record<AgentDomainId, string> = {
  general: "General intelligence",
  prop_firm: "Prop firm intelligence",
  commerce: "Commerce intelligence",
  social: "Social research",
};

export const agentToolDefinitions: AgentToolDefinition[] = [
  {
    id: "inspect_dataset",
    name: "Inspect dataset",
    description: "Detect columns, types, row count, missing values, date fields, and entity fields.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string }",
    outputSchema: "{ columns: DatasetColumn[], row_count: number, missing: string[] }",
  },
  {
    id: "profile_metrics",
    name: "Profile metrics",
    description: "Summarize totals, averages, distributions, anomalies, and top segments.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string, metric_roles: string[] }",
    outputSchema: "{ numeric_totals: object[], category_counts: object[], missing: string[] }",
  },
  {
    id: "query_dataset",
    name: "Query dataset",
    description: "Filter, group, and sort local tabular data.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string, group_by?: string, measure?: string }",
    outputSchema: "{ rows: object[] }",
  },
  {
    id: "compare_segments",
    name: "Compare segments",
    description: "Compare account types, product categories, traffic sources, authors, or date windows.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string, segment_column: string, measure_column: string }",
    outputSchema: "{ segments: Array<{ label: string, count: number, total: number }> }",
  },
  {
    id: "trend_analysis",
    name: "Trend analysis",
    description: "Find daily, weekly, or monthly movement, seasonality, spikes, and drops.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string, date_column: string, measure_column: string }",
    outputSchema: "{ series: Array<{ label: string, value: number }> }",
  },
  {
    id: "effectiveness_analysis",
    name: "Effectiveness analysis",
    description: "Estimate before/after or exposed/unexposed impact for discounts, campaigns, payouts, and process changes.",
    risk: "medium",
    approvalMode: "none",
    inputSchema: "{ dataset_id: string, exposure_column: string, measure_column: string }",
    outputSchema: "{ exposed_average: number, baseline_average: number, lift: number }",
  },
  {
    id: "generate_visual_blocks",
    name: "Generate visual blocks",
    description: "Produce KPI, table, bar, line, comparison, and timeline blocks from reviewed tool results.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ tool_results: object[] }",
    outputSchema: "{ visualizations: VisualizationBlock[] }",
  },
  {
    id: "create_brief_artifact",
    name: "Create brief artifact",
    description: "Write the research memo, ops report, or dossier from sourced insights.",
    risk: "medium",
    approvalMode: "none",
    inputSchema: "{ insights: Insight[], evidence: EvidenceSource[] }",
    outputSchema: "{ draft: DraftArtifact }",
  },
  {
    id: "audit_artifact",
    name: "Audit artifact",
    description: "Score evidence coverage, metric validity, unsupported claims, actionability, and audience fit.",
    risk: "low",
    approvalMode: "none",
    inputSchema: "{ draft_id: string, evidence_ids: string[] }",
    outputSchema: "{ score: number, publish_ready: boolean, required_fixes: string[] }",
  },
  {
    id: "propose_work",
    name: "Propose work",
    description: "Convert approved findings into task proposals without mutating Tasks or Board.",
    risk: "medium",
    approvalMode: "review_before_apply",
    inputSchema: "{ run_id: string, findings: string[] }",
    outputSchema: "{ proposed_tasks: ProposedTask[] }",
  },
];

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function numberValue(value: DatasetRowValue) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: DatasetRowValue) {
  if (value === null || value === undefined || value === "") return "Unspecified";
  return String(value);
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function inferColumnType(values: DatasetRowValue[]): DatasetColumnType {
  const present = values.filter((value) => value !== null && value !== "");
  if (present.length === 0) return "string";
  if (present.every((value) => typeof value === "boolean" || /^(true|false)$/i.test(String(value)))) {
    return "boolean";
  }
  if (present.every((value) => Number.isFinite(Number(String(value).replace(/[$,%]/g, ""))))) {
    return "number";
  }
  if (present.every((value) => !Number.isNaN(Date.parse(String(value))))) {
    return "date";
  }
  return "string";
}

function inferSemanticRole(key: string, type: DatasetColumnType, domainId: AgentDomainId): DatasetSemanticRole | undefined {
  const label = key.toLowerCase();
  if (/(date|day|week|month|created|posted|paid_at|order_at)/.test(label)) return "date";
  if (/(revenue|income|sales|amount|gmv|price)/.test(label)) return domainId === "commerce" ? "sales" : "revenue";
  if (/(profit|pnl|net|margin)/.test(label)) return "profit";
  if (/(payout|withdrawal)/.test(label)) return "payout";
  if (/(stage|account_type|funded|evaluation|sim|live)/.test(label)) return "account_stage";
  if (/(account_status|breach|status)/.test(label)) return "status";
  if (/(discount|coupon|promo)/.test(label)) return "discount";
  if (/(product|sku|item)/.test(label)) return "product";
  if (/(category|collection)/.test(label)) return "category";
  if (/(customer|trader|client|account_id|order_id|post_id)/.test(label)) return "entity";
  if (/(channel|network|platform)/.test(label)) return "channel";
  if (/(author|ceo|brand|handle)/.test(label)) return "author";
  if (/(engagement|likes|comments|shares|views|clicks|impressions)/.test(label)) return "engagement";
  if (/(owner|assignee)/.test(label)) return "owner";
  if (type === "date") return "date";
  return undefined;
}

export function buildDatasetColumns(
  rows: DataRow[],
  domainId: AgentDomainId,
  explicitRoles: Partial<Record<string, DatasetSemanticRole>> = {},
): DatasetColumn[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.map((key) => {
    const values = rows.map((row) => row[key] ?? null);
    const type = inferColumnType(values);
    const present = values.filter((value) => value !== null && value !== "").length;
    const sampleValues = Array.from(new Set(values.filter((value) => value !== null && value !== "").map(String))).slice(0, 4);
    return {
      key,
      label: titleCase(key),
      type,
      semanticRole: explicitRoles[key] ?? inferSemanticRole(key, type, domainId),
      missingRate: rows.length === 0 ? 1 : round(1 - present / rows.length),
      sampleValues,
    };
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function coerceValue(value: string): DatasetRowValue {
  if (!value) return null;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  const numeric = Number(value.replace(/[$,%]/g, ""));
  if (Number.isFinite(numeric) && /^[$%]?\d/.test(value)) return numeric;
  return value;
}

export function createDatasetFromCsv({
  projectId,
  name,
  domainId,
  text,
}: {
  projectId: string;
  name: string;
  domainId: AgentDomainId;
  text: string;
}): ProjectDataset {
  const parsed = parseCsv(text);
  const headers = (parsed[0] ?? []).map((header, index) =>
    (header || `column_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
  );
  const rows = parsed.slice(1).map((values) =>
    headers.reduce<DataRow>((row, header, index) => {
      row[header] = coerceValue(values[index] ?? "");
      return row;
    }, {}),
  );
  const timestamp = now();

  return {
    id: id("dataset"),
    projectId,
    name,
    domainId,
    sourceKind: "csv",
    columns: buildDatasetColumns(rows, domainId),
    rows,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSampleDataset(projectId: string, domainId: AgentDomainId): ProjectDataset {
  const timestamp = now();
  const rowsByDomain: Record<AgentDomainId, DataRow[]> = {
    general: [
      { date: "2026-06-01", status: "todo", owner: "Alex", priority: "high", effort: 6 },
      { date: "2026-06-02", status: "in_progress", owner: "Jordan", priority: "medium", effort: 4 },
      { date: "2026-06-03", status: "done", owner: "Sam", priority: "high", effort: 5 },
    ],
    prop_firm: [
      { date: "2026-06-01", account_stage: "Evaluation", revenue: 12800, payout: 0, profit: 8900, breaches: 9, cohort: "New trader" },
      { date: "2026-06-02", account_stage: "Evaluation", revenue: 14100, payout: 0, profit: 9300, breaches: 7, cohort: "New trader" },
      { date: "2026-06-03", account_stage: "Sim funded", revenue: 6200, payout: 2300, profit: 3100, breaches: 3, cohort: "Passed evaluation" },
      { date: "2026-06-04", account_stage: "Sim funded", revenue: 7100, payout: 3100, profit: 2800, breaches: 2, cohort: "Passed evaluation" },
      { date: "2026-06-05", account_stage: "Live funded", revenue: 9400, payout: 4800, profit: 3600, breaches: 1, cohort: "Scaled trader" },
      { date: "2026-06-06", account_stage: "Live funded", revenue: 10100, payout: 5200, profit: 3900, breaches: 1, cohort: "Scaled trader" },
    ],
    commerce: [
      { date: "2026-06-01", product: "Starter plan", category: "Subscription", sales: 9200, orders: 42, discount: 0, margin: 0.71 },
      { date: "2026-06-02", product: "Starter plan", category: "Subscription", sales: 11100, orders: 50, discount: 10, margin: 0.66 },
      { date: "2026-06-03", product: "Pro plan", category: "Subscription", sales: 17600, orders: 33, discount: 15, margin: 0.62 },
      { date: "2026-06-04", product: "Template pack", category: "Digital goods", sales: 5400, orders: 88, discount: 20, margin: 0.77 },
      { date: "2026-06-05", product: "Pro plan", category: "Subscription", sales: 19300, orders: 37, discount: 0, margin: 0.73 },
      { date: "2026-06-06", product: "Template pack", category: "Digital goods", sales: 6100, orders: 95, discount: 10, margin: 0.74 },
    ],
    social: [
      { date: "2026-06-01", author: "CEO", channel: "LinkedIn", theme: "Founder note", posts: 1, impressions: 38000, engagement: 2450 },
      { date: "2026-06-02", author: "Brand", channel: "LinkedIn", theme: "Product update", posts: 1, impressions: 21000, engagement: 980 },
      { date: "2026-06-03", author: "CEO", channel: "X", theme: "Market POV", posts: 2, impressions: 47000, engagement: 3100 },
      { date: "2026-06-04", author: "Brand", channel: "X", theme: "Feature launch", posts: 2, impressions: 26000, engagement: 1150 },
      { date: "2026-06-05", author: "CEO", channel: "LinkedIn", theme: "Customer story", posts: 1, impressions: 52000, engagement: 4100 },
      { date: "2026-06-06", author: "Brand", channel: "LinkedIn", theme: "Hiring", posts: 1, impressions: 16000, engagement: 620 },
    ],
  };
  const rows = rowsByDomain[domainId];
  const explicitRoles =
    domainId === "commerce"
      ? { margin: "profit" as const, orders: "sales" as const }
      : domainId === "social"
        ? { impressions: "engagement" as const, theme: "category" as const, posts: "sales" as const }
        : {};

  return {
    id: id("dataset"),
    projectId,
    name: `${domainLabels[domainId]} sample`,
    domainId,
    sourceKind: "mock",
    columns: buildDatasetColumns(rows, domainId, explicitRoles),
    rows,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createWorkspaceDataset(projectId: string, tasks: Task[]): ProjectDataset {
  const rows = tasks.map((task) => ({
    created_at: task.createdAt,
    task: task.title,
    status: task.status,
    priority: task.priority ?? "medium",
    owner: task.assignee ?? "Unassigned",
    effort: task.priority === "high" ? 5 : task.priority === "medium" ? 3 : 1,
  }));
  const timestamp = now();
  return {
    id: "workspace-tasks",
    projectId,
    name: "Workspace tasks",
    domainId: "general",
    sourceKind: "workspace",
    columns: buildDatasetColumns(rows, "general"),
    rows,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function roleColumn(dataset: ProjectDataset, roles: DatasetSemanticRole[], fallbackType?: DatasetColumnType) {
  return (
    dataset.columns.find((column) => column.semanticRole && roles.includes(column.semanticRole)) ??
    dataset.columns.find((column) => (fallbackType ? column.type === fallbackType : false))
  );
}

function inspectDataset(dataset: ProjectDataset) {
  const missing = dataset.columns
    .filter((column) => column.missingRate > 0.25)
    .map((column) => `${column.label} is ${Math.round(column.missingRate * 100)}% missing`);
  return {
    rowCount: dataset.rows.length,
    columns: dataset.columns,
    missing,
    dateColumns: dataset.columns.filter((column) => column.semanticRole === "date").map((column) => column.label),
    entityColumns: dataset.columns.filter((column) => column.semanticRole === "entity").map((column) => column.label),
  };
}

function profileMetrics(dataset: ProjectDataset): ProfileResult {
  const numericColumns = dataset.columns.filter((column) => column.type === "number");
  const category = roleColumn(dataset, ["account_stage", "category", "product", "author", "channel", "status"], "string");
  const categoryCounts = new Map<string, number>();
  if (category) {
    dataset.rows.forEach((row) => {
      const label = stringValue(row[category.key]);
      categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
    });
  }

  return {
    rowCount: dataset.rows.length,
    numericTotals: numericColumns.slice(0, 5).map((column) => {
      const values = dataset.rows.map((row) => numberValue(row[column.key]));
      const total = values.reduce((sum, value) => sum + value, 0);
      return { label: column.label, total: round(total), average: round(total / Math.max(1, values.length)) };
    }),
    categoryCounts: Array.from(categoryCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 6),
    missing: inspectDataset(dataset).missing,
  };
}

function compareSegments(dataset: ProjectDataset): SegmentResult[] {
  const segment = roleColumn(dataset, ["account_stage", "category", "product", "author", "channel", "status"], "string");
  const measure = roleColumn(dataset, ["profit", "revenue", "sales", "engagement", "payout"], "number");
  if (!segment || !measure) return [];

  const groups = new Map<string, { count: number; total: number }>();
  dataset.rows.forEach((row) => {
    const label = stringValue(row[segment.key]);
    const current = groups.get(label) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += numberValue(row[measure.key]);
    groups.set(label, current);
  });

  return Array.from(groups.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      total: round(value.total),
      average: round(value.total / Math.max(1, value.count)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function trendAnalysis(dataset: ProjectDataset): TrendResult[] {
  const date = roleColumn(dataset, ["date"], "date");
  const measure = roleColumn(dataset, ["profit", "revenue", "sales", "engagement", "payout"], "number");
  if (!date || !measure) return [];

  const groups = new Map<string, number>();
  dataset.rows.forEach((row) => {
    const parsed = new Date(stringValue(row[date.key]));
    const label = Number.isNaN(parsed.getTime()) ? stringValue(row[date.key]) : parsed.toISOString().slice(0, 10);
    groups.set(label, (groups.get(label) ?? 0) + numberValue(row[measure.key]));
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value: round(value) }))
    .slice(-8);
}

function effectivenessAnalysis(dataset: ProjectDataset) {
  const exposure = roleColumn(dataset, ["discount", "payout"], "number");
  const measure = roleColumn(dataset, ["profit", "revenue", "sales", "engagement"], "number");
  if (!exposure || !measure) return null;

  const exposed = dataset.rows.filter((row) => numberValue(row[exposure.key]) > 0);
  const baseline = dataset.rows.filter((row) => numberValue(row[exposure.key]) <= 0);
  const exposedAverage =
    exposed.reduce((sum, row) => sum + numberValue(row[measure.key]), 0) / Math.max(1, exposed.length);
  const baselineAverage =
    baseline.reduce((sum, row) => sum + numberValue(row[measure.key]), 0) / Math.max(1, baseline.length);

  return {
    exposureLabel: exposure.label,
    measureLabel: measure.label,
    exposedAverage: round(exposedAverage),
    baselineAverage: round(baselineAverage),
    lift: round(exposedAverage - baselineAverage),
  };
}

function toolResult(
  toolId: string,
  inputSummary: string,
  outputSummary: string,
  evidenceIndex: number,
): ToolResult {
  const definition = agentToolDefinitions.find((tool) => tool.id === toolId);
  return {
    id: id("tool"),
    toolId,
    toolName: definition?.name ?? toolId,
    inputSummary,
    outputSummary,
    evidenceId: `ev-agent-${evidenceIndex}`,
    durationMs: 18 + evidenceIndex * 7,
  };
}

function buildToolInvocation(result: ToolResult): ToolInvocation {
  return {
    id: result.id,
    toolId: result.toolId,
    toolName: result.toolName,
    status: "success",
    inputSummary: result.inputSummary,
    outputSummary: result.outputSummary,
    evidenceIds: [result.evidenceId],
    durationMs: result.durationMs,
    createdAt: now(),
  };
}

function buildEvidence(result: ToolResult, confidence: number): EvidenceSource {
  return {
    id: result.evidenceId,
    kind: "database",
    title: result.toolName,
    source: result.inputSummary,
    excerpt: result.outputSummary,
    confidence,
    linkedClaimIds: [`claim-${result.toolId}`],
    toolInvocationId: result.id,
  };
}

function classifyDomain(prompt: string, datasets: ProjectDataset[]): AgentDomainId {
  const input = prompt.toLowerCase();
  if (/(prop|trader|funded|evaluation|payout|breach|p&l|pnl)/.test(input)) return "prop_firm";
  if (/(commerce|order|shop|product|discount|coupon|sales|margin|refund)/.test(input)) return "commerce";
  if (/(social|linkedin|twitter|x |post|ceo|brand|engagement|impressions)/.test(input)) return "social";
  return datasets.find((dataset) => dataset.domainId !== "general")?.domainId ?? "general";
}

function pickDataset(domainId: AgentDomainId, datasets: ProjectDataset[], tasks: Task[], projectId: string) {
  return (
    datasets.find((dataset) => dataset.domainId === domainId) ??
    datasets.find((dataset) => dataset.domainId !== "general") ??
    datasets[0] ??
    createWorkspaceDataset(projectId, tasks)
  );
}

function buildMetrics(profile: ProfileResult, dataset: ProjectDataset): MetricDefinition[] {
  return profile.numericTotals.slice(0, 4).map((metric) => {
    const sourceColumn = dataset.columns.find((column) => column.label === metric.label);
    return {
      id: id("metric"),
      name: `Total ${metric.label}`,
      formula: `sum(${sourceColumn?.key ?? metric.label})`,
      sourceColumnKeys: sourceColumn ? [sourceColumn.key] : [],
      unit: /margin|rate|discount/i.test(metric.label) ? "percent" : "currency",
      grain: "segment",
    };
  });
}

function buildInsights({
  domainId,
  dataset,
  profile,
  segments,
  trend,
  effectiveness,
  evidence,
}: {
  domainId: AgentDomainId;
  dataset: ProjectDataset;
  profile: ProfileResult;
  segments: SegmentResult[];
  trend: TrendResult[];
  effectiveness: ReturnType<typeof effectivenessAnalysis>;
  evidence: EvidenceSource[];
}): Insight[] {
  const topSegment = segments[0];
  const latestTrend = trend[trend.length - 1];
  const primaryMetric = profile.numericTotals[0];
  const domainAction: Record<AgentDomainId, string> = {
    general: "Turn the highest-signal work into owned tasks and review blocked items daily.",
    prop_firm: "Separate evaluation, sim funded, and live funded reporting so payout exposure is reviewed before scaling.",
    commerce: "Promote the strongest product/time window and review discount lift before extending offers.",
    social: "Shift the next content sprint toward the author, theme, and channel with the strongest engagement.",
  };

  return [
    {
      id: "claim-dataset-coverage",
      claim: `${dataset.name} gives the agent ${profile.rowCount} rows and ${dataset.columns.length} typed fields to inspect.`,
      evidenceIds: [evidence[0]?.id].filter(Boolean),
      confidence: profile.rowCount > 0 ? 0.86 : 0.35,
      recommendedAction: "Confirm this dataset is authoritative before publishing externally.",
    },
    {
      id: "claim-top-segment",
      claim: topSegment
        ? `${topSegment.label} is the strongest observed segment with ${topSegment.total} total measured value.`
        : "The agent needs at least one segment column and one numeric measure for stronger comparison.",
      evidenceIds: [evidence[2]?.id].filter(Boolean),
      confidence: topSegment ? 0.82 : 0.42,
      recommendedAction: domainAction[domainId],
      assumption: !topSegment,
    },
    {
      id: "claim-trend",
      claim: latestTrend
        ? `The latest period in the reviewed trend is ${latestTrend.label} with ${latestTrend.value} measured value.`
        : "Trend quality is limited until a date column and numeric measure are mapped.",
      evidenceIds: [evidence[3]?.id].filter(Boolean),
      confidence: latestTrend ? 0.78 : 0.38,
      recommendedAction: "Use the trend as the operating cadence for follow-up tasks.",
      assumption: !latestTrend,
    },
    {
      id: "claim-effectiveness",
      claim: effectiveness
        ? `${effectiveness.exposureLabel} changes correlate with ${effectiveness.lift} ${effectiveness.measureLabel} lift versus baseline.`
        : primaryMetric
          ? `${primaryMetric.label} totals ${primaryMetric.total}, with an average of ${primaryMetric.average} per row.`
          : "Effectiveness analysis needs an exposure column such as discount, payout, or campaign.",
      evidenceIds: [evidence[4]?.id ?? evidence[1]?.id].filter(Boolean),
      confidence: effectiveness ? 0.74 : 0.58,
      recommendedAction: "Run a follow-up experiment before treating correlation as causation.",
      assumption: !effectiveness,
    },
  ];
}

function buildVisualizations({
  profile,
  segments,
  trend,
  effectiveness,
}: {
  profile: ProfileResult;
  segments: SegmentResult[];
  trend: TrendResult[];
  effectiveness: ReturnType<typeof effectivenessAnalysis>;
}): VisualizationBlock[] {
  const blocks: VisualizationBlock[] = [
    {
      id: id("viz"),
      kind: "kpi",
      title: "Dataset signal",
      insight: "The agent used typed rows, numeric measures, and segment coverage before writing the brief.",
      data: [
        { label: "Rows", value: profile.rowCount },
        { label: "Metrics", value: profile.numericTotals.length },
        { label: "Segments", value: profile.categoryCounts.length },
      ],
    },
    {
      id: id("viz"),
      kind: "table",
      title: "Metric profile",
      insight: "Totals and averages from mapped numeric fields.",
      data: profile.numericTotals.map((item) => ({
        metric: item.label,
        total: item.total,
        average: item.average,
      })),
    },
  ];

  if (segments.length > 0) {
    blocks.push({
      id: id("viz"),
      kind: "bar",
      title: "Segment comparison",
      insight: "Shows which business segment currently contributes the most measured value.",
      data: segments.map((segment) => ({ label: segment.label, value: segment.total, count: segment.count })),
    });
  }

  if (trend.length > 0) {
    blocks.push({
      id: id("viz"),
      kind: "line",
      title: "Recent trend",
      insight: "Uses mapped date and measure fields to establish operating cadence.",
      data: trend.map((item) => ({ label: item.label, value: item.value })),
    });
  }

  if (effectiveness) {
    blocks.push({
      id: id("viz"),
      kind: "comparison",
      title: "Effectiveness read",
      insight: "Compares exposed rows against baseline rows for a directional lift estimate.",
      data: [
        { label: "Exposed", value: effectiveness.exposedAverage },
        { label: "Baseline", value: effectiveness.baselineAverage },
        { label: "Lift", value: effectiveness.lift },
      ],
    });
  }

  return blocks;
}

function sourceIdsAt(evidence: EvidenceSource[], ...indexes: number[]) {
  return indexes.map((index) => evidence[index]?.id).filter((item): item is string => Boolean(item));
}

function buildArtifactTable({
  title,
  caption,
  rows,
  sourceIds,
}: {
  title: string;
  caption: string;
  rows: Array<Record<string, string | number>>;
  sourceIds: string[];
}): ArtifactTable {
  const columns = Object.keys(rows[0] ?? {}).map((key) => ({
    key,
    label: titleCase(key),
    align: rows.some((row) => typeof row[key] === "number") ? ("right" as const) : ("left" as const),
  }));

  return {
    id: id("artifact-table"),
    title,
    caption,
    columns,
    rows,
    sourceIds,
  };
}

function buildArtifactChart({
  block,
  sourceIds,
}: {
  block: VisualizationBlock;
  sourceIds: string[];
}): ArtifactChart {
  return {
    id: id("artifact-chart"),
    type: block.kind === "table" ? "bar" : block.kind,
    title: block.title,
    insight: block.insight,
    xField: "label",
    yField: "value",
    data: block.data,
    sourceIds,
  };
}

function buildStructuredSections({
  prompt,
  domainId,
  dataset,
  profile,
  segments,
  trend,
  effectiveness,
  insights,
  evidence,
  visualizations,
}: {
  prompt: string;
  domainId: AgentDomainId;
  dataset: ProjectDataset;
  profile: ProfileResult;
  segments: SegmentResult[];
  trend: TrendResult[];
  effectiveness: ReturnType<typeof effectivenessAnalysis>;
  insights: Insight[];
  evidence: EvidenceSource[];
  visualizations: VisualizationBlock[];
}): ArtifactSection[] {
  const kpiBlock = visualizations.find((block) => block.kind === "kpi");
  const segmentChart = visualizations.find((block) => block.kind === "bar");
  const trendChart = visualizations.find((block) => block.kind === "line");
  const effectivenessChart = visualizations.find((block) => block.kind === "comparison");
  const metricRows = profile.numericTotals.map((item) => ({
    metric: item.label,
    total: item.total,
    average: item.average,
  }));
  const segmentRows = segments.map((item) => ({
    segment: item.label,
    count: item.count,
    total: item.total,
    average: item.average,
  }));
  const claims: ArtifactClaim[] = insights.map((insight, index) => ({
    id: insight.id,
    claim: insight.claim,
    confidence: insight.confidence,
    citationIds: insight.evidenceIds.length ? insight.evidenceIds : sourceIdsAt(evidence, index),
    assumption: insight.assumption,
  }));
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return [
    {
      id: id("artifact-section"),
      title: "Cover",
      purpose: "Frame the report before the reader enters the evidence.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "hero",
          eyebrow: domainLabels[domainId],
          title: `${domainLabels[domainId]} brief: ${dataset.name}`,
          subtitle: `A structured in-app research artifact answering: ${prompt}`,
          meta: [
            { label: "Generated", value: date },
            { label: "Dataset", value: dataset.name },
            { label: "Rows", value: String(profile.rowCount) },
            { label: "Trend points", value: String(trend.length) },
            { label: "Source", value: dataset.sourceKind.toUpperCase() },
          ],
        },
        {
          id: id("artifact-block"),
          type: "summary",
          title: "Executive snapshot",
          body: `The agent inspected ${profile.rowCount} rows, mapped ${dataset.columns.length} fields, profiled metrics, compared segments, checked trend movement, and prepared action-ready recommendations.`,
          takeaways: insights.slice(0, 4).map((insight) => insight.claim),
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Research Question",
      purpose: "Show exactly what the brief is answering.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "summary",
          title: "Question answered",
          body: prompt,
          takeaways: [
            `Domain pack: ${domainLabels[domainId]}.`,
            "Read-only analysis completed before any task proposal.",
            "Every key claim links to evidence or is marked as an assumption.",
          ],
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Data Foundation",
      purpose: "Make the source quality inspectable before conclusions.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "kpi_grid",
          title: "Dataset readiness",
          insight: "The minimum viable quality check before findings are trusted.",
          items:
            kpiBlock?.data.map((item) => ({
              label: String(item.label),
              value: item.value,
              detail: "Reviewed by agent runtime",
            })) ?? [],
          sourceIds: sourceIdsAt(evidence, 0, 1),
        },
        {
          id: id("artifact-block"),
          type: "table",
          table: buildArtifactTable({
            title: "Metric profile",
            caption: "Totals and averages from mapped numeric fields.",
            rows: metricRows,
            sourceIds: sourceIdsAt(evidence, 1),
          }),
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Visual Analysis",
      purpose: "Turn the inspected dataset into readable analytical artifacts.",
      blocks: [
        ...(segmentChart
          ? [
              {
                id: id("artifact-block"),
                type: "chart" as const,
                chart: buildArtifactChart({ block: segmentChart, sourceIds: sourceIdsAt(evidence, 2) }),
              },
              {
                id: id("artifact-block"),
                type: "table" as const,
                table: buildArtifactTable({
                  title: "Segment comparison table",
                  caption: "Ranked business segments from the comparison tool.",
                  rows: segmentRows,
                  sourceIds: sourceIdsAt(evidence, 2),
                }),
              },
            ]
          : []),
        ...(trendChart
          ? [
              {
                id: id("artifact-block"),
                type: "chart" as const,
                chart: buildArtifactChart({ block: trendChart, sourceIds: sourceIdsAt(evidence, 3) }),
              },
            ]
          : []),
        ...(effectivenessChart && effectiveness
          ? [
              {
                id: id("artifact-block"),
                type: "chart" as const,
                chart: buildArtifactChart({ block: effectivenessChart, sourceIds: sourceIdsAt(evidence, 4) }),
              },
            ]
          : []),
      ],
    },
    {
      id: id("artifact-section"),
      title: "Findings And Recommendations",
      purpose: "Separate supported claims from actions the team can review.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "finding",
          title: "Source-backed findings",
          claims,
        },
        {
          id: id("artifact-block"),
          type: "recommendation",
          title: "Prioritized actions",
          recommendations: insights.map((insight, index) => ({
            priority: index === 0 ? "high" : index === 1 ? "medium" : "low",
            action: insight.recommendedAction,
            expectedImpact:
              domainId === "prop_firm"
                ? "Sharper account-stage control and clearer payout/P&L ownership."
                : domainId === "commerce"
                  ? "Better sales focus, cleaner discount decisions, and clearer margin tradeoffs."
                  : domainId === "social"
                    ? "Stronger posting cadence and topic selection based on engagement evidence."
                    : "Clearer project execution and better follow-through.",
            sourceIds: insight.evidenceIds,
          })),
        },
      ],
    },
    {
      id: id("artifact-section"),
      title: "Handoff And Appendix",
      purpose: "Explain what can become work and preserve the review trace.",
      blocks: [
        {
          id: id("artifact-block"),
          type: "task_proposal",
          title: "Agent handoff",
          body: "After approval, Nexus can summon the agent to propose tasks, owners, board status, priority, and due dates. Applying the proposal remains review-gated.",
        },
        {
          id: id("artifact-block"),
          type: "evidence",
          title: "Source evidence",
          sourceIds: evidence.map((source) => source.id),
        },
        {
          id: id("artifact-block"),
          type: "audit",
          title: "Audit appendix",
          checklistIds: ["plan", "sources", "claims", "charts", "actions", "audience", "export"],
        },
      ],
    },
  ];
}

function buildDraft({
  prompt,
  domainId,
  dataset,
  profile,
  segments,
  trend,
  effectiveness,
  insights,
  evidence,
  visualizations,
}: {
  prompt: string;
  domainId: AgentDomainId;
  dataset: ProjectDataset;
  profile: ProfileResult;
  segments: SegmentResult[];
  trend: TrendResult[];
  effectiveness: ReturnType<typeof effectivenessAnalysis>;
  insights: Insight[];
  evidence: EvidenceSource[];
  visualizations: VisualizationBlock[];
}): DraftArtifact {
  const style = detectBriefStyle(prompt);
  const topClaims = insights.map((insight) => insight.claim);
  return {
    id: id("draft"),
    version: 1,
    style,
    title: `${domainLabels[domainId]} brief: ${dataset.name}`,
    summary: `The agent inspected ${profile.rowCount} rows from ${dataset.name}, profiled mapped metrics, compared available segments, and produced review-ready recommendations with source-linked claims.`,
    thesis: `This brief treats ${dataset.name} as the current operating evidence base. Claims are grounded in tool observations, while incomplete analysis paths are marked as assumptions.`,
    sections: [
      {
        id: "section-data-foundation",
        eyebrow: "Data foundation",
        title: "What the agent inspected",
        body: `${dataset.columns.length} columns were typed and mapped into business roles such as date, segment, metric, owner, or status where possible.`,
        bullets: [
          `${profile.numericTotals.length} numeric metrics are available for analysis.`,
          profile.missing.length > 0 ? profile.missing[0] : "No high-missingness column blocked the first pass.",
          `Primary source kind: ${dataset.sourceKind}.`,
        ],
      },
      {
        id: "section-findings",
        eyebrow: "Findings",
        title: "What changed the read",
        body: "The strongest signals come from metric totals, segment concentration, recent trend shape, and directional effectiveness checks.",
        bullets: topClaims.slice(0, 3),
      },
      {
        id: "section-actions",
        eyebrow: "Recommendations",
        title: "How the team should respond",
        body: "The agent can turn these recommendations into task proposals after the brief is approved, keeping all board mutations behind review.",
        bullets: insights.map((insight) => insight.recommendedAction).slice(0, 4),
      },
    ],
    citations: insights.flatMap((insight, index) =>
      insight.evidenceIds.map((sourceId) => ({ label: `Claim ${index + 1}`, sourceId })),
    ),
    findings: topClaims,
    recommendations: insights.map((insight) => insight.recommendedAction),
    visualizations,
    artifactSections: buildStructuredSections({
      prompt,
      domainId,
      dataset,
      profile,
      segments,
      trend,
      effectiveness,
      insights,
      evidence,
      visualizations,
    }),
    createdAt: now(),
  };
}

function buildSteps(results: ToolResult[], draftId: string): AgentStep[] {
  return [
    {
      id: id("step"),
      kind: "plan",
      title: "Plan domain analysis",
      status: "completed",
      summary: "Detected the best domain pack, selected project datasets, and prepared read-only tools.",
      createdAt: now(),
    },
    ...results.map<AgentStep>((result) => ({
      id: id("step"),
      kind: "tool_call",
      title: result.toolName,
      status: "completed",
      summary: result.outputSummary,
      toolInvocationId: result.id,
      createdAt: now(),
    })),
    {
      id: id("step"),
      kind: "draft",
      title: "Create sourced artifact",
      status: "completed",
      summary: `Created draft ${draftId} from inspected evidence and tool outputs.`,
      createdAt: now(),
    },
    {
      id: id("step"),
      kind: "audit",
      title: "Audit artifact",
      status: "completed",
      summary: "Scored the artifact for plan completeness, source coverage, claim support, and actionability.",
      createdAt: now(),
    },
  ];
}

export function runBusinessIntelligenceAgent(input: AgentRuntimeInput): {
  workRun: WorkRun;
  agentRun: AgentRun;
  memoryNotes: AgentMemoryNote[];
} {
  const timestamp = now();
  const projectId = input.project?.id ?? "proj-1";
  const domainId = classifyDomain(input.prompt, input.datasets);
  const dataset = pickDataset(domainId, input.datasets, input.tasks, projectId);
  const inspection = inspectDataset(dataset);
  const profile = profileMetrics(dataset);
  const segments = compareSegments(dataset);
  const trend = trendAnalysis(dataset);
  const effectiveness = effectivenessAnalysis(dataset);

  const toolResults = [
    toolResult(
      "inspect_dataset",
      dataset.name,
      `${inspection.rowCount} rows, ${inspection.columns.length} columns, ${inspection.dateColumns.length} date fields, ${inspection.entityColumns.length} entity fields.`,
      0,
    ),
    toolResult(
      "profile_metrics",
      dataset.name,
      `${profile.numericTotals.length} numeric metrics, ${profile.categoryCounts.length} segment buckets, ${profile.missing.length} missing-data warnings.`,
      1,
    ),
    toolResult(
      "compare_segments",
      dataset.name,
      segments.length > 0
        ? `${segments[0].label} leads the segment comparison with ${segments[0].total} total value.`
        : "No usable segment and measure pair was found.",
      2,
    ),
    toolResult(
      "trend_analysis",
      dataset.name,
      trend.length > 0
        ? `Trend spans ${trend[0].label} to ${trend[trend.length - 1].label}.`
        : "No usable date and measure pair was found.",
      3,
    ),
    toolResult(
      "effectiveness_analysis",
      dataset.name,
      effectiveness
        ? `${effectiveness.exposureLabel} exposed rows average ${effectiveness.exposedAverage}; baseline averages ${effectiveness.baselineAverage}.`
        : "No exposure column was available for lift analysis.",
      4,
    ),
  ];
  const evidence = toolResults.map((result, index) => buildEvidence(result, index < 2 ? 0.9 : 0.76));
  const insights = buildInsights({ domainId, dataset, profile, segments, trend, effectiveness, evidence });
  const visualizations = buildVisualizations({ profile, segments, trend, effectiveness });
  const draft = buildDraft({
    prompt: input.prompt,
    domainId,
    dataset,
    profile,
    segments,
    trend,
    effectiveness,
    insights,
    evidence,
    visualizations,
  });

  const workRunId = id("run");
  const agentRunId = id("agent-run");
  const plan = createPlanArtifact(input.prompt, input.project);
  const preparedPlan = {
    ...plan,
    sources: [dataset.name, "Project tasks", "Project contacts", "Recent chat context"],
    assumptions: [
      `Using ${domainLabels[domainId]} as the domain pack for this request.`,
      "CSV and mock datasets are treated as workspace-approved sources in v1.",
      "Task and board mutations require proposal review before apply.",
    ],
  };

  const workRunBase: WorkRun = {
    id: workRunId,
    projectId,
    agentRunId,
    domainId,
    datasetIds: [dataset.id],
    title: draft.title,
    request: input.prompt,
    phase: "audit",
    status: "ready",
    plan: preparedPlan,
    evidence,
    drafts: [draft],
    audit: {
      id: id("audit"),
      score: 0,
      publishReady: false,
      checklist: [],
      failedChecks: [],
      requiredFixes: [],
      createdAt: timestamp,
    },
    iteration: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const workRun = {
    ...workRunBase,
    audit: auditWorkRun(workRunBase),
  };

  const memoryNotes: AgentMemoryNote[] = insights.slice(0, 2).map((insight) => ({
    id: id("memory"),
    projectId,
    runId: agentRunId,
    title: insight.claim.slice(0, 72),
    body: insight.recommendedAction,
    createdAt: timestamp,
  }));
  const agentRun: AgentRun = {
    id: agentRunId,
    projectId,
    workRunId,
    request: input.prompt,
    status: "completed",
    domainId,
    model: input.model,
    datasetIds: [dataset.id],
    steps: buildSteps(toolResults, draft.id),
    toolInvocations: toolResults.map(buildToolInvocation),
    metrics: buildMetrics(profile, dataset),
    insights,
    memoryNotes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { workRun, agentRun, memoryNotes };
}

export function domainLabel(domainId: AgentDomainId) {
  return domainLabels[domainId];
}
