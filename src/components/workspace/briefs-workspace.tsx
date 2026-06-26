import { useMemo, useState, type ChangeEvent } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Database,
  RefreshCw,
  Send,
  Sparkles,
  Table2,
  TriangleAlert,
  Upload,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { domainLabel } from "@/lib/agents/runtime";
import { briefStyleLabel } from "@/lib/artifacts/brief-loop";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type {
  AgentDomainId,
  AgentActionProposal,
  ArtifactBlock,
  ArtifactSection,
  ArtifactChart,
  ArtifactTable,
  AuditResult,
  DatasetSemanticRole,
  DraftArtifact,
  EvidenceSource,
  ProjectDataset,
  ProposedTask,
  WorkRun,
} from "@/types";

const statusLabels = {
  draft: "Draft",
  running: "Improving",
  blocked: "Needs changes",
  ready: "Ready for review",
  published: "Published",
} satisfies Record<WorkRun["status"], string>;

function latestDraft(run: WorkRun): DraftArtifact | undefined {
  return run.drafts[run.drafts.length - 1];
}

function WorkRunList({
  runs,
  selectedId,
  onSelect,
}: {
  runs: WorkRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-h-0 border-b border-border bg-pane xl:border-b-0 xl:border-r">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Project briefs
        </p>
        <h2 className="mt-1 text-base font-semibold">Research artifacts</h2>
      </div>
      <ScrollArea className="h-52 xl:h-[calc(100%-61px)]">
        <div className="p-2">
          {runs.map((run) => {
            const draft = latestDraft(run);
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelect(run.id)}
                className={cn(
                  "mb-1 flex w-full flex-col gap-2 rounded-md border border-transparent px-3 py-3 text-left text-sm transition-colors",
                  selectedId === run.id
                    ? "border-border bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="line-clamp-2 font-medium">{run.title}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{draft ? briefStyleLabel(draft.style) : "Brief"}</Badge>
                  <span>{run.audit.score}/100</span>
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function NewBriefForm({
  onCreate,
}: {
  onCreate: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(
    "Create a research memo for this project with evidence, source-backed findings, recommendations, and tasks the agent can propose after review.",
  );
  const [isCreating, setIsCreating] = useState(false);

  const submit = async () => {
    if (!prompt.trim()) return;
    setIsCreating(true);
    await onCreate(prompt.trim());
    setIsCreating(false);
  };

  return (
    <Card className="rounded-md" size="sm">
      <CardHeader>
        <CardTitle>Start a brief</CardTitle>
        <CardDescription>
          The agent chooses research memo, ops report, or market dossier from the prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-28 resize-none"
          placeholder="Ask for a research memo, internal ops report, or competitive dossier."
        />
        <Button onClick={() => void submit()} disabled={isCreating || !prompt.trim()}>
          <Sparkles data-icon="inline-start" />
          Create artifact
        </Button>
      </CardContent>
    </Card>
  );
}

const domainOptions: Array<{ id: AgentDomainId; label: string }> = [
  { id: "prop_firm", label: "Prop firm" },
  { id: "commerce", label: "Commerce" },
  { id: "social", label: "Social" },
  { id: "general", label: "General" },
];

const semanticRoles: DatasetSemanticRole[] = [
  "date",
  "entity",
  "account_stage",
  "status",
  "revenue",
  "profit",
  "payout",
  "sales",
  "discount",
  "product",
  "category",
  "customer",
  "channel",
  "author",
  "engagement",
  "priority",
  "owner",
];

function DatasetPanel({
  datasets,
  projectId,
  onAddSample,
  onImportCsv,
  onRoleChange,
}: {
  datasets: ProjectDataset[];
  projectId?: string | null;
  onAddSample: (domainId: AgentDomainId) => void;
  onImportCsv: (
    projectId: string,
    name: string,
    domainId: AgentDomainId,
    text: string,
  ) => void;
  onRoleChange: (
    datasetId: string,
    columnKey: string,
    semanticRole?: DatasetSemanticRole,
  ) => void;
}) {
  const [csvDomain, setCsvDomain] = useState<AgentDomainId>("general");

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || !projectId) return;
    const text = await file.text();
    onImportCsv(projectId, file.name.replace(/\.csv$/i, ""), csvDomain, text);
    event.currentTarget.value = "";
  };

  return (
    <Card className="rounded-md" size="sm">
      <CardHeader>
        <CardTitle>Data sources</CardTitle>
        <CardDescription>
          Use sample packs or import CSV data. The agent reads these before drafting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {domainOptions.slice(0, 3).map((domain) => (
            <Button
              key={domain.id}
              variant="outline"
              size="sm"
              onClick={() => projectId && onAddSample(domain.id)}
              disabled={!projectId}
            >
              <Database data-icon="inline-start" />
              {domain.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Select value={csvDomain} onValueChange={(value) => setCsvDomain(value as AgentDomainId)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {domainOptions.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              !projectId && "pointer-events-none opacity-50",
            )}
          >
            <Upload data-icon="inline-start" />
            CSV
            <input
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              disabled={!projectId}
              onChange={importFile}
            />
          </label>
        </div>
        <div className="space-y-2">
          {datasets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
              No project datasets yet. Load a sample pack or import a CSV to unlock stronger analysis.
            </div>
          ) : (
            datasets.slice(0, 4).map((dataset) => (
              <div key={dataset.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{dataset.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dataset.rows.length} rows - {dataset.columns.length} fields
                    </p>
                  </div>
                  <Badge variant="secondary">{domainLabel(dataset.domainId)}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {dataset.columns.slice(0, 5).map((column) => (
                    <div key={column.key} className="grid grid-cols-[1fr_130px] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{column.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {column.type} - {column.sampleValues.join(", ") || "empty"}
                        </p>
                      </div>
                      <Select
                        value={column.semanticRole ?? "none"}
                        onValueChange={(value) =>
                          onRoleChange(
                            dataset.id,
                            column.key,
                            value === "none" ? undefined : (value as DatasetSemanticRole),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No role</SelectItem>
                          {semanticRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceRail({ evidence }: { evidence: EvidenceSource[] }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </p>
      {evidence.map((source, index) => (
        <div key={source.id} className="rounded-md border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                [{index + 1}] {source.title}
              </p>
              <p className="text-xs text-muted-foreground">{source.source}</p>
            </div>
            <Badge variant={source.missing ? "destructive" : "secondary"}>
              {Math.round(source.confidence * 100)}%
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{source.excerpt}</p>
          {source.toolInvocationId && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-active">
              <Table2 className="size-3" />
              {source.toolInvocationId}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function formatCell(value: string | number) {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function CitationChips({
  sourceIds,
  evidenceById,
}: {
  sourceIds: string[];
  evidenceById: Map<string, EvidenceSource>;
}) {
  if (sourceIds.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sourceIds.map((sourceId) => {
        const source = evidenceById.get(sourceId);
        return (
          <Badge key={sourceId} variant="outline" className="max-w-full truncate">
            {source?.title ?? sourceId}
          </Badge>
        );
      })}
    </div>
  );
}

function ArtifactTableView({
  table,
  evidenceById,
}: {
  table: ArtifactTable;
  evidenceById: Map<string, EvidenceSource>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{table.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{table.caption}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-2 font-medium",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={`${table.id}-${index}`} className="border-t border-border">
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn("px-4 py-2", column.align === "right" && "text-right tabular-nums")}
                  >
                    {formatCell(row[column.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <CitationChips sourceIds={table.sourceIds} evidenceById={evidenceById} />
      </div>
    </div>
  );
}

function ArtifactChartView({
  chart,
  evidenceById,
}: {
  chart: ArtifactChart;
  evidenceById: Map<string, EvidenceSource>;
}) {
  const values = chart.data.map((row) => Number(row[chart.yField] ?? row.value ?? row.count ?? 0));
  const max = Math.max(1, ...values);
  const points = chart.data.map((row, index) => {
    const x = chart.data.length <= 1 ? 50 : (index / (chart.data.length - 1)) * 100;
    const y = 92 - (Number(row[chart.yField] ?? row.value ?? 0) / max) * 76;
    return `${x},${y}`;
  });

  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{chart.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{chart.insight}</p>
        </div>
        <BarChart3 className="size-4 text-active" />
      </div>

      {chart.type === "line" || chart.type === "timeline" ? (
        <div className="mt-5">
          <svg viewBox="0 0 100 100" className="h-40 w-full overflow-visible">
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-active"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point, index) => {
              const [x, y] = point.split(",").map(Number);
              return (
                <circle key={`${chart.id}-${index}`} cx={x} cy={y} r="2.4" className="fill-active" />
              );
            })}
          </svg>
          <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {chart.data.slice(0, 4).map((row, index) => (
              <div key={`${chart.id}-label-${index}`} className="flex justify-between gap-2">
                <span className="truncate">{String(row[chart.xField] ?? row.label)}</span>
                <span className="font-medium text-foreground">
                  {formatCell(Number(row[chart.yField] ?? row.value ?? 0))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {chart.data.map((row, index) => {
            const label = String(row[chart.xField] ?? row.label ?? `Item ${index + 1}`);
            const value = Number(row[chart.yField] ?? row.value ?? row.count ?? 0);
            return (
              <div key={`${chart.id}-${label}`} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{label}</span>
                  <span className="font-medium tabular-nums">{formatCell(value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      chart.type === "comparison" ? "bg-success" : "bg-active",
                    )}
                    style={{ width: `${Math.max(8, (value / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CitationChips sourceIds={chart.sourceIds} evidenceById={evidenceById} />
    </div>
  );
}

function fallbackSections(draft: DraftArtifact): ArtifactSection[] {
  return [
    {
      id: "fallback-cover",
      title: "Cover",
      purpose: "Legacy artifact cover.",
      blocks: [
        {
          id: "fallback-hero",
          type: "hero",
          eyebrow: briefStyleLabel(draft.style),
          title: draft.title,
          subtitle: draft.thesis,
          meta: [
            { label: "Version", value: `v${draft.version}` },
            { label: "Sections", value: String(draft.sections.length) },
          ],
        },
        {
          id: "fallback-summary",
          type: "summary",
          title: "Executive summary",
          body: draft.summary,
          takeaways: draft.findings,
        },
      ],
    },
  ];
}

function ArtifactBlockView({
  block,
  run,
  evidenceById,
}: {
  block: ArtifactBlock;
  run: WorkRun;
  evidenceById: Map<string, EvidenceSource>;
}) {
  if (block.type === "hero") {
    return (
      <header className="rounded-md border border-border bg-background p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{block.eyebrow}</Badge>
          <Badge variant={run.audit.publishReady ? "default" : "outline"}>
            {statusLabels[run.status]}
          </Badge>
          <Badge variant="outline">{run.audit.score}/100 audit</Badge>
        </div>
        <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-tight tracking-normal">
          {block.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          {block.subtitle}
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {block.meta.map((item) => (
            <div key={`${block.id}-${item.label}`} className="rounded-md border border-border bg-muted/40 p-3">
              <dt className="text-xs uppercase text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 truncate text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </header>
    );
  }

  if (block.type === "summary") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {block.title}
        </p>
        <p className="mt-3 text-lg leading-8">{block.body}</p>
        <div className="mt-4 grid gap-2">
          {block.takeaways.map((takeaway) => (
            <div key={takeaway} className="flex gap-2 rounded-md bg-muted/50 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{takeaway}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "kpi_grid") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{block.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{block.insight}</p>
          </div>
          <Sparkles className="size-4 text-active" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {block.items.map((item) => (
            <div key={`${block.id}-${item.label}`} className="rounded-md border border-border bg-muted/30 p-4">
              <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCell(item.value)}</p>
              {item.detail && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}
            </div>
          ))}
        </div>
        <CitationChips sourceIds={block.sourceIds} evidenceById={evidenceById} />
      </section>
    );
  }

  if (block.type === "chart") {
    return <ArtifactChartView chart={block.chart} evidenceById={evidenceById} />;
  }

  if (block.type === "table") {
    return <ArtifactTableView table={block.table} evidenceById={evidenceById} />;
  }

  if (block.type === "finding") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-sm font-semibold">{block.title}</p>
        <div className="mt-4 space-y-3">
          {block.claims.map((claim) => (
            <div key={claim.id} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-6">{claim.claim}</p>
                <Badge variant={claim.assumption ? "outline" : "secondary"}>
                  {claim.assumption ? "Assumption" : `${Math.round(claim.confidence * 100)}%`}
                </Badge>
              </div>
              <CitationChips sourceIds={claim.citationIds} evidenceById={evidenceById} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "recommendation") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-sm font-semibold">{block.title}</p>
        <div className="mt-4 space-y-3">
          {block.recommendations.map((recommendation) => (
            <div key={recommendation.action} className="rounded-md border border-border p-3">
              <div className="flex items-start gap-3">
                <Badge variant={recommendation.priority === "high" ? "destructive" : "secondary"}>
                  {recommendation.priority}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{recommendation.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{recommendation.expectedImpact}</p>
                  <CitationChips sourceIds={recommendation.sourceIds} evidenceById={evidenceById} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "evidence") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-sm font-semibold">{block.title}</p>
        <div className="mt-4 grid gap-3">
          {block.sourceIds.map((sourceId) => {
            const source = evidenceById.get(sourceId);
            if (!source) return null;
            return (
              <div key={sourceId} className="rounded-md bg-muted/40 p-3">
                <p className="text-sm font-medium">{source.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{source.excerpt}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (block.type === "audit") {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-sm font-semibold">{block.title}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {run.audit.checklist
            .filter((check) => block.checklistIds.includes(check.id))
            .map((check) => (
              <div key={check.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span>{check.label}</span>
                <Badge variant={check.status === "fail" ? "destructive" : check.status === "warn" ? "outline" : "secondary"}>
                  {check.score}
                </Badge>
              </div>
            ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <ArrowUpRight className="mt-0.5 size-4 text-active" />
        <div>
          <p className="text-sm font-semibold">{block.title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.body}</p>
        </div>
      </div>
    </section>
  );
}

function ArtifactReader({
  run,
  draft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
}) {
  const sections = draft.artifactSections?.length ? draft.artifactSections : fallbackSections(draft);
  const evidenceById = useMemo(
    () => new Map(run.evidence.map((source) => [source.id, source])),
    [run.evidence],
  );

  return (
    <article className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.id} className="space-y-3">
              {section.title !== "Cover" && (
                <div className="border-b border-border pb-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-active">
                    {section.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{section.purpose}</p>
                </div>
              )}
              <div className="space-y-4">
                {section.blocks.map((block) => (
                  <ArtifactBlockView
                    key={block.id}
                    block={block}
                    run={run}
                    evidenceById={evidenceById}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Report status</p>
              <Badge variant={run.audit.publishReady ? "default" : "outline"}>
                {run.audit.score}/100
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{run.audit.stopReason}</p>
            <div className="mt-3 space-y-2">
              {run.audit.checklist.slice(0, 4).map((check) => (
                <div key={check.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{check.label}</span>
                  <span className="font-medium">{check.score}</span>
                </div>
              ))}
            </div>
          </div>
          <EvidenceRail evidence={run.evidence} />
        </aside>
      </div>
    </article>
  );
}

function AuditPanel({
  run,
  audit,
  onImprove,
  onApprove,
  onSummon,
}: {
  run: WorkRun;
  audit: AuditResult;
  onImprove: () => void;
  onApprove: () => void;
  onSummon: () => void;
}) {
  const canSummon = run.plan.approved && audit.publishReady;

  return (
    <Card className="rounded-md" size="sm">
      <CardHeader>
        <CardTitle>Audit / required changes</CardTitle>
        <CardDescription>{audit.stopReason}</CardDescription>
        <CardAction>
          <Badge variant={audit.publishReady ? "default" : "outline"}>
            {audit.score}/100
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {audit.checklist.map((check) => (
          <div key={check.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span>{check.label}</span>
            <Badge variant={check.status === "fail" ? "destructive" : check.status === "warn" ? "outline" : "secondary"}>
              {check.score}
            </Badge>
          </div>
        ))}
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Changes needed
          </p>
          {audit.requiredFixes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {audit.requiredFixes.map((fix) => (
                <li key={fix} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{fix}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No blocking changes. The brief is ready for review and agent handoff.
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onImprove} className="w-full">
          <RefreshCw data-icon="inline-start" />
          Improve brief
        </Button>
        <Button onClick={onApprove} disabled={run.plan.approved} className="w-full">
          <ClipboardCheck data-icon="inline-start" />
          Approve brief
        </Button>
        <Button onClick={onSummon} disabled={!canSummon} className="w-full">
          <Send data-icon="inline-start" />
          Summon agent
        </Button>
      </CardContent>
    </Card>
  );
}

function ProposedTaskRow({
  task,
  assigneeAvatarUrl,
}: {
  task: ProposedTask;
  assigneeAvatarUrl?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{task.reason}</p>
        </div>
        <Badge variant={task.priority === "high" ? "destructive" : "secondary"}>
          {task.priority}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.suggestedAssignee ? (
          <span className="inline-flex items-center gap-1">
            <PersonAvatar
              name={task.suggestedAssignee}
              avatarUrl={assigneeAvatarUrl}
              size="sm"
              shape="square"
            />
            {task.suggestedAssignee}
          </span>
        ) : (
          <Badge variant="outline">Unassigned</Badge>
        )}
        <Badge variant="outline" className="capitalize">
          {task.status.replace("_", " ")}
        </Badge>
        {task.dueDate && <span>Due {task.dueDate}</span>}
      </div>
    </div>
  );
}

function ProposalPanel({
  proposal,
  membersByName,
  onApprove,
  onApply,
  onReject,
}: {
  proposal?: AgentActionProposal;
  membersByName: Map<string, { avatarUrl?: string }>;
  onApprove: () => void;
  onApply: () => void;
  onReject: () => void;
}) {
  if (!proposal) {
    return (
      <Card className="rounded-md" size="sm">
        <CardHeader>
          <CardTitle>Agent handoff</CardTitle>
          <CardDescription>
            Approve a brief and summon the agent to draft tasks, owners, board status, and roadmap items.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="rounded-md" size="sm">
      <CardHeader>
        <CardTitle>Agent proposal</CardTitle>
        <CardDescription>Review before applying changes to Tasks, Board, Timeline, and Roadmap.</CardDescription>
        <CardAction>
          <Badge variant={proposal.status === "applied" ? "default" : "secondary"}>
            {proposal.status.replace("_", " ")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposal.proposedTasks.map((task) => (
          <ProposedTaskRow
            key={task.id}
            task={task}
            assigneeAvatarUrl={
              task.suggestedAssignee ? membersByName.get(task.suggestedAssignee)?.avatarUrl : undefined
            }
          />
        ))}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={proposal.status === "applied" || proposal.status === "rejected"}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            onClick={onApprove}
            disabled={proposal.status === "approved" || proposal.status === "applied"}
          >
            Approve
          </Button>
          <Button onClick={onApply} disabled={!["approved", "needs_review"].includes(proposal.status)}>
            Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BriefsWorkspace() {
  const projectId = useSelectionStore((state) => state.projectId);
  const {
    workRuns,
    selectedWorkRunId,
    actionProposals,
    teamMembers,
    datasets,
    createArtifactRunFromPromptStream,
    addSampleDataset,
    importCsvDataset,
    updateDatasetColumnRole,
    selectWorkRun,
    approveWorkRunPlan,
    createDraftForRun,
    createActionProposalForRun,
    approveActionProposal,
    rejectActionProposal,
    applyActionProposal,
  } = useDataStore();

  const projectRuns = useMemo(
    () => workRuns.filter((run) => run.projectId === projectId),
    [projectId, workRuns],
  );
  const projectDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.projectId === projectId),
    [datasets, projectId],
  );
  const selectedRun = useMemo(
    () =>
      projectRuns.find((run) => run.id === selectedWorkRunId) ??
      projectRuns[0] ??
      workRuns[0],
    [projectRuns, selectedWorkRunId, workRuns],
  );
  const draft = selectedRun ? latestDraft(selectedRun) : undefined;
  const proposal = selectedRun
    ? actionProposals.find((item) => item.runId === selectedRun.id && item.status !== "rejected")
    : undefined;
  const membersByName = useMemo(
    () =>
      new Map(
        teamMembers
          .filter((member) => member.projectId === projectId)
          .map((member) => [member.name, { avatarUrl: member.avatarUrl }]),
      ),
    [projectId, teamMembers],
  );

  const createRun = async (prompt: string) => {
    await createArtifactRunFromPromptStream(prompt, projectId ?? undefined);
  };

  if (!selectedRun || !draft) {
    return (
      <div className="grid h-full gap-4 bg-shell p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <NewBriefForm onCreate={createRun} />
        <DatasetPanel
          datasets={projectDatasets}
          projectId={projectId}
          onAddSample={(domainId) => {
            if (projectId) addSampleDataset(projectId, domainId);
          }}
          onImportCsv={importCsvDataset}
          onRoleChange={updateDatasetColumnRole}
        />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-shell xl:grid-cols-[260px_minmax(0,1fr)]">
      <WorkRunList runs={projectRuns} selectedId={selectedRun.id} onSelect={selectWorkRun} />
      <div className="grid min-h-0 grid-cols-1 overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <ScrollArea className="min-h-0">
          <div className="p-5">
            <ArtifactReader run={selectedRun} draft={draft} />
          </div>
        </ScrollArea>
        <aside className="min-h-0 border-t border-border bg-pane 2xl:border-l 2xl:border-t-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              <NewBriefForm onCreate={createRun} />
              <DatasetPanel
                datasets={projectDatasets}
                projectId={projectId}
                onAddSample={(domainId) => {
                  if (projectId) addSampleDataset(projectId, domainId);
                }}
                onImportCsv={importCsvDataset}
                onRoleChange={updateDatasetColumnRole}
              />
              <Separator />
              <AuditPanel
                run={selectedRun}
                audit={selectedRun.audit}
                onImprove={() => createDraftForRun(selectedRun.id)}
                onApprove={() => approveWorkRunPlan(selectedRun.id)}
                onSummon={() => createActionProposalForRun(selectedRun.id)}
              />
              <ProposalPanel
                proposal={proposal}
                membersByName={membersByName}
                onApprove={() => proposal && approveActionProposal(proposal.id)}
                onReject={() => proposal && rejectActionProposal(proposal.id)}
                onApply={() => proposal && applyActionProposal(proposal.id)}
              />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
