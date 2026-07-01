import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  BarChart3,
  CheckCircle2,
  Database,
  Sparkles,
  Table2,
  Upload,
  ArrowUpRight,
  BookOpen,
  Download,
  FileText,
  History,
  ListChecks,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { domainLabel } from "@/lib/agents/runtime";
import {
  knowledgePacks,
  type KnowledgePackId,
} from "@/lib/agents/knowledge-packs";
import { briefStyleLabel } from "@/lib/artifacts/brief-loop";
import { briefTemplateLabels } from "@/lib/artifacts/design";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type {
  AgentDomainId,
  ArtifactBlock,
  ArtifactSection,
  ArtifactChart,
  ArtifactClaim,
  ArtifactTable,
  DatasetSemanticRole,
  DraftArtifact,
  EvidenceSource,
  PendingArtifactPlan,
  ProjectDataset,
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
                  {draft?.designTemplate ? (
                    <Badge variant="outline">{briefTemplateLabels[draft.designTemplate]}</Badge>
                  ) : null}
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
  "score",
  "priority",
  "owner",
];

function DatasetPanel({
  datasets,
  projectId,
  onAddKnowledgePack,
  onAddSample,
  onImportCsv,
  onRoleChange,
}: {
  datasets: ProjectDataset[];
  projectId?: string | null;
  onAddKnowledgePack: (packId: KnowledgePackId) => void;
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
          Add public-source knowledge packs or import CSV data. The agent reads these before drafting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {knowledgePacks.map((pack) => (
            <div key={pack.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{pack.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pack.description}</p>
                </div>
                <Badge variant="secondary">{pack.rows.length} rows</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pack.useCases.slice(0, 3).map((useCase) => (
                  <Badge key={useCase} variant="outline" className="text-[11px]">
                    {useCase}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {pack.sourceName}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => projectId && onAddKnowledgePack(pack.id)}
                  disabled={!projectId}
                >
                  <BookOpen data-icon="inline-start" />
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {domainOptions.slice(0, 3).map((domain) => (
            <Button
              key={domain.id}
              variant="secondary"
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
                    {dataset.sourceMetadata && (
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                        {dataset.sourceMetadata.sourceName}
                      </p>
                    )}
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

function collectClaims(draft: DraftArtifact): ArtifactClaim[] {
  return (
    draft.artifactSections?.flatMap((section) =>
      section.blocks.flatMap((block) => (block.type === "finding" ? block.claims : [])),
    ) ?? []
  );
}

function claimGroups(claims: ArtifactClaim[]) {
  return {
    supported: claims.filter((claim) => !claim.assumption && claim.citationIds.length > 0),
    assumptions: claims.filter((claim) => claim.assumption),
    lowConfidence: claims.filter((claim) => claim.confidence < 0.65),
    missingCitations: claims.filter((claim) => claim.citationIds.length === 0),
  };
}

function findPlanForRun(run: WorkRun, plans: PendingArtifactPlan[]) {
  return (
    plans.find((plan) => plan.sourceRunId === run.id) ??
    plans.find((plan) => plan.id === run.sourcePlanId)
  );
}

function downloadHtml(draft: DraftArtifact) {
  const artifact = draft.htmlArtifact;
  if (!artifact) return;
  const blob = new Blob([artifact.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openPrintableHtml(draft: DraftArtifact) {
  const artifact = draft.htmlArtifact;
  if (!artifact) return;
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.open();
  win.document.write(artifact.html);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 500);
}

function StudioStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function HtmlArtifactPreview({
  run,
  draft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
}) {
  if (!draft.htmlArtifact) {
    return <ArtifactReader run={run} draft={draft} />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{draft.htmlArtifact.fileName}</p>
          <p className="text-xs text-muted-foreground">
            Standalone HTML artifact - citations, audit, appendix, and print controls included
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadHtml(draft)}>
            <Download data-icon="inline-start" />
            HTML
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openPrintableHtml(draft)}>
            <Printer data-icon="inline-start" />
            PDF
          </Button>
        </div>
      </div>
      <iframe
        title={draft.htmlArtifact.title}
        srcDoc={draft.htmlArtifact.html}
        sandbox="allow-scripts allow-popups allow-modals"
        className="h-[72vh] w-full bg-background"
      />
    </div>
  );
}

function PlanTab({
  run,
  plan,
}: {
  run: WorkRun;
  plan?: PendingArtifactPlan;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Approved plan
        </p>
        <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">
          {plan?.markdown ??
            run.approvedPlanMarkdown ??
            [
              `Objective: ${run.plan.objective}`,
              "",
              `Audience: ${run.plan.audience}`,
              "",
              "Questions:",
              ...run.plan.questions.map((question) => `- ${question}`),
              "",
              "Success criteria:",
              ...run.plan.successCriteria.map((item) => `- ${item}`),
            ].join("\n")}
        </pre>
      </section>
      <aside className="space-y-3">
        <StudioStat label="Status" value={plan?.status ?? (run.plan.approved ? "approved" : "draft")} />
        <StudioStat label="Format" value={plan?.deliverableFormat?.toUpperCase() ?? "HTML"} />
        <StudioStat label="Run" value={run.iteration ? `Iteration ${run.iteration}` : "Iteration 1"} />
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Request</p>
          <p className="mt-2 text-sm leading-6">{run.request}</p>
        </div>
      </aside>
    </div>
  );
}

function EvidenceStudioTab({
  run,
  draft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
}) {
  const claims = collectClaims(draft);
  const claimBySource = new Map<string, ArtifactClaim[]>();
  claims.forEach((claim) => {
    claim.citationIds.forEach((sourceId) => {
      claimBySource.set(sourceId, [...(claimBySource.get(sourceId) ?? []), claim]);
    });
  });

  return (
    <div className="grid gap-3">
      {run.evidence.map((source, index) => (
        <section key={source.id} className="rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                [{index + 1}] {source.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{source.source}</p>
            </div>
            <Badge variant={source.missing ? "destructive" : "secondary"}>
              {source.missing ? "Missing" : `${Math.round(source.confidence * 100)}%`}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{source.excerpt}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(claimBySource.get(source.id) ?? []).map((claim) => (
              <Badge key={claim.id} variant="outline" className="max-w-full truncate">
                {claim.claim}
              </Badge>
            ))}
            {(claimBySource.get(source.id) ?? []).length === 0 ? (
              <Badge variant="outline">No linked claim</Badge>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function ClaimsAuditTab({
  run,
  draft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
}) {
  const groups = claimGroups(collectClaims(draft));
  const buckets = [
    { id: "supported", title: "Supported", claims: groups.supported },
    { id: "assumptions", title: "Assumptions", claims: groups.assumptions },
    { id: "low", title: "Low confidence", claims: groups.lowConfidence },
    { id: "missing", title: "Missing citations", claims: groups.missingCitations },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioStat label="Audit score" value={`${run.audit.score}/100`} />
        <StudioStat label="Supported" value={groups.supported.length} />
        <StudioStat label="Assumptions" value={groups.assumptions.length} />
        <StudioStat label="Fixes" value={run.audit.requiredFixes.length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {buckets.map((bucket) => (
          <section key={bucket.id} className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{bucket.title}</p>
              <Badge variant="secondary">{bucket.claims.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {bucket.claims.length === 0 ? (
                <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  No claims in this bucket.
                </p>
              ) : (
                bucket.claims.map((claim) => (
                  <article key={`${bucket.id}-${claim.id}`} className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-sm leading-6">{claim.claim}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant={claim.assumption ? "outline" : "secondary"}>
                        {claim.assumption ? "Assumption" : `${Math.round(claim.confidence * 100)}%`}
                      </Badge>
                      <Badge variant={claim.citationIds.length ? "outline" : "destructive"}>
                        {claim.citationIds.length} citations
                      </Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function VersionsTab({
  run,
  selectedDraftId,
  onSelectDraft,
}: {
  run: WorkRun;
  selectedDraftId?: string;
  onSelectDraft: (id: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {run.drafts.map((draft) => (
        <button
          key={draft.id}
          type="button"
          onClick={() => onSelectDraft(draft.id)}
          className={cn(
            "rounded-md border p-4 text-left transition-colors",
            selectedDraftId === draft.id
              ? "border-active/40 bg-active/5"
              : "border-border bg-background hover:bg-muted/50",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                v{draft.version} - {draft.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(draft.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{briefStyleLabel(draft.style)}</Badge>
              {draft.designTemplate ? (
                <Badge variant="outline">{briefTemplateLabels[draft.designTemplate]}</Badge>
              ) : null}
              {draft.htmlArtifact?.exportReady ? <Badge>Export ready</Badge> : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ExportTab({ draft }: { draft: DraftArtifact }) {
  const artifact = draft.htmlArtifact;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-md border border-border bg-background p-5">
        <p className="text-sm font-semibold">Delivery package</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The v1 export path is HTML-first. The standalone file includes the toolbar,
          citations, claims audit, evidence appendix, and print/PDF styles.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!artifact} onClick={() => downloadHtml(draft)}>
            <Download data-icon="inline-start" />
            Download HTML
          </Button>
          <Button disabled={!artifact} variant="secondary" onClick={() => openPrintableHtml(draft)}>
            <Printer data-icon="inline-start" />
            Print / Save PDF
          </Button>
        </div>
      </section>
      <aside className="space-y-3">
        <StudioStat label="File" value={artifact?.fileName ?? "Not generated"} />
        <StudioStat label="Visuals" value={artifact?.visualizationCount ?? 0} />
        <StudioStat label="Tables" value={artifact?.tableCount ?? 0} />
        <StudioStat label="Sources" value={artifact?.evidenceCount ?? 0} />
      </aside>
    </div>
  );
}

function BriefStudio({
  run,
  draft,
  plan,
  selectedDraftId,
  onSelectDraft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
  plan?: PendingArtifactPlan;
  selectedDraftId?: string;
  onSelectDraft: (id: string) => void;
}) {
  return (
    <article className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-md border border-border bg-pane p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Brief artifact module</Badge>
              <Badge variant={run.audit.publishReady ? "default" : "outline"}>
                {run.audit.score}/100 audit
              </Badge>
              {draft.designTemplate ? (
                <Badge variant="outline">{briefTemplateLabels[draft.designTemplate]}</Badge>
              ) : null}
            </div>
            <h1 className="mt-3 truncate text-xl font-semibold">{draft.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Chat remains the control surface; this is the brief delivery module created from the approved plan,
              tool evidence, model narrative, and deterministic audit.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <StudioStat label="Version" value={`v${draft.version}`} />
            <StudioStat label="Stages" value={draft.htmlArtifact?.deliveryStages?.length ?? run.deliveryStages?.length ?? 0} />
            <StudioStat label="Export" value={draft.htmlArtifact?.exportReady ? "Ready" : "Draft"} />
          </div>
        </div>
      </section>

      <Tabs defaultValue="preview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="preview"><FileText data-icon="inline-start" />Preview</TabsTrigger>
          <TabsTrigger value="plan"><ListChecks data-icon="inline-start" />Plan</TabsTrigger>
          <TabsTrigger value="evidence"><Database data-icon="inline-start" />Evidence</TabsTrigger>
          <TabsTrigger value="audit"><ShieldCheck data-icon="inline-start" />Claims Audit</TabsTrigger>
          <TabsTrigger value="versions"><History data-icon="inline-start" />Versions</TabsTrigger>
          <TabsTrigger value="export"><Download data-icon="inline-start" />Export</TabsTrigger>
        </TabsList>
        <TabsContent value="preview">
          <HtmlArtifactPreview run={run} draft={draft} />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab run={run} plan={plan} />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceStudioTab run={run} draft={draft} />
        </TabsContent>
        <TabsContent value="audit">
          <ClaimsAuditTab run={run} draft={draft} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab
            run={run}
            selectedDraftId={selectedDraftId}
            onSelectDraft={onSelectDraft}
          />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab draft={draft} />
        </TabsContent>
      </Tabs>
    </article>
  );
}

export function BriefsWorkspace() {
  const projectId = useSelectionStore((state) => state.projectId);
  const {
    workRuns,
    selectedWorkRunId,
    datasets,
    pendingArtifactPlans,
    addKnowledgePackDataset,
    addSampleDataset,
    importCsvDataset,
    updateDatasetColumnRole,
    selectWorkRun,
  } = useDataStore();

  const projectRuns = useMemo(
    () => workRuns.filter((run) => run.projectId === projectId),
    [projectId, workRuns],
  );
  const projectDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.projectId === projectId && !dataset.worktreeId),
    [datasets, projectId],
  );
  const selectedRun = useMemo(
    () =>
      projectRuns.find((run) => run.id === selectedWorkRunId) ??
      projectRuns[0] ??
      workRuns[0],
    [projectRuns, selectedWorkRunId, workRuns],
  );
  const latestSelectedDraft = selectedRun ? latestDraft(selectedRun) : undefined;
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>(latestSelectedDraft?.id);
  useEffect(() => {
    setSelectedDraftId(latestSelectedDraft?.id);
  }, [latestSelectedDraft?.id, selectedRun?.id]);
  const draft = useMemo(
    () =>
      selectedRun?.drafts.find((item) => item.id === selectedDraftId) ??
      latestSelectedDraft,
    [latestSelectedDraft, selectedDraftId, selectedRun?.drafts],
  );
  const selectedPlan = selectedRun ? findPlanForRun(selectedRun, pendingArtifactPlans) : undefined;
  if (!selectedRun || !draft) {
    return (
      <div className="grid h-full gap-4 bg-shell p-6 lg:grid-cols-[minmax(0,420px)]">
        <DatasetPanel
          datasets={projectDatasets}
          projectId={projectId}
          onAddKnowledgePack={(packId) => {
            if (projectId) addKnowledgePackDataset(projectId, packId);
          }}
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
      <ScrollArea className="min-h-0">
        <div className="p-5">
          <BriefStudio
            run={selectedRun}
            draft={draft}
            plan={selectedPlan}
            selectedDraftId={selectedDraftId}
            onSelectDraft={setSelectedDraftId}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
