import { briefStyleLabel } from "@/lib/artifacts/brief-loop";
import {
  briefIntentLabels,
  briefTemplateDescriptions,
  briefTemplateLabels,
  nexusArtifactDesign,
} from "@/lib/artifacts/design";
import type {
  ArtifactBlock,
  ArtifactChart,
  ArtifactSection,
  ArtifactTable,
  BriefDesignTemplate,
  BriefIntent,
  DraftArtifact,
  EvidenceSource,
  HtmlBriefArtifact,
  WorkRun,
} from "@/types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "nexus-brief";
}

function formatCell(value: string | number | undefined) {
  if (typeof value === "number") return value.toLocaleString();
  return value ?? "";
}

function detectBriefIntent(draft: DraftArtifact, run: WorkRun): BriefIntent {
  if (draft.briefIntent) return draft.briefIntent;
  const input = `${run.request} ${draft.title} ${draft.summary} ${draft.thesis} ${draft.findings.join(" ")}`.toLowerCase();
  if (/(risk|audit|compliance|control|governance|unsupported|assumption|quality|legal)/.test(input)) {
    return "risk_compliance";
  }
  if (/(ops|operation|internal|queue|staff|launch|execution|blocker|status|workflow|sla)/.test(input)) {
    return "operational_review";
  }
  if (/(market|competitor|competitive|dossier|benchmark|positioning|category)/.test(input)) {
    return "market_intelligence";
  }
  if (/(performance|metric|kpi|snapshot|trend|revenue|payout|score)/.test(input)) {
    return "performance_snapshot";
  }
  if (/(action|roadmap|next step|owner|sequence|plan)/.test(input)) {
    return "action_plan";
  }
  return "executive_decision";
}

function selectDesignTemplate(intent: BriefIntent, draft: DraftArtifact, run: WorkRun): BriefDesignTemplate {
  if (draft.designTemplate) return draft.designTemplate;
  const input = `${run.request} ${draft.title} ${draft.summary} ${draft.thesis}`.toLowerCase();
  if (intent === "risk_compliance" || /(risk|audit|compliance|control|governance|unsupported)/.test(input)) {
    return "risk_compliance";
  }
  if (intent === "operational_review" || /(ops|operation|queue|launch|execution|blocker|status|workflow)/.test(input)) {
    return "ops_command";
  }
  return "executive_board";
}

function templateClass(template: BriefDesignTemplate) {
  return `template-${template.replace(/_/g, "-")}`;
}

function sourceBadges(
  sourceIds: string[],
  evidenceById: Map<string, EvidenceSource>,
  sourceNumbers: Map<string, number>,
) {
  if (sourceIds.length === 0) return "";
  return `<div class="source-badges">${sourceIds
    .map((sourceId) => {
      const source = evidenceById.get(sourceId);
      const sourceNumber = sourceNumbers.get(sourceId);
      return `<span data-source-id="${escapeHtml(sourceId)}"><strong>${sourceNumber ? `[${sourceNumber}]` : ""}</strong>${escapeHtml(source?.title ?? sourceId)}</span>`;
    })
    .join("")}</div>`;
}

function tableHtml(
  table: ArtifactTable,
  evidenceById: Map<string, EvidenceSource>,
  sourceNumbers: Map<string, number>,
) {
  return `<section class="card table-card">
    <div class="section-kicker">Table</div>
    <h3>${escapeHtml(table.title)}</h3>
    <p class="muted">${escapeHtml(table.caption)}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${table.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${table.rows
            .map(
              (row) =>
                `<tr>${table.columns
                  .map((column) => `<td class="${column.align === "right" ? "right" : ""}">${escapeHtml(formatCell(row[column.key]))}</td>`)
                  .join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${sourceBadges(table.sourceIds, evidenceById, sourceNumbers)}
  </section>`;
}

function chartHtml(
  chart: ArtifactChart,
  evidenceById: Map<string, EvidenceSource>,
  sourceNumbers: Map<string, number>,
) {
  const values = chart.data.map((row) => Number(row[chart.yField] ?? row.value ?? row.count ?? 0));
  const max = Math.max(1, ...values);

  if (chart.type === "line" || chart.type === "timeline") {
    const points = chart.data.map((row, index) => {
      const x = chart.data.length <= 1 ? 50 : 6 + (index / (chart.data.length - 1)) * 88;
      const y = 92 - (Number(row[chart.yField] ?? row.value ?? 0) / max) * 72;
      return { x, y, label: String(row[chart.xField] ?? row.label ?? `Point ${index + 1}`), value: Number(row[chart.yField] ?? row.value ?? 0) };
    });

    return `<section class="card chart-card">
      <div class="section-kicker">Visualization</div>
      <h3>${escapeHtml(chart.title)}</h3>
      <p class="muted">${escapeHtml(chart.insight)}</p>
      <svg class="line-chart" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(chart.title)}">
        <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"></polyline>
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.2"></circle>`).join("")}
      </svg>
      <div class="chart-labels">${points
        .slice(0, 6)
        .map((point) => `<div><span>${escapeHtml(point.label)}</span><strong>${escapeHtml(formatCell(point.value))}</strong></div>`)
        .join("")}</div>
      ${sourceBadges(chart.sourceIds, evidenceById, sourceNumbers)}
    </section>`;
  }

  return `<section class="card chart-card">
    <div class="section-kicker">Visualization</div>
    <h3>${escapeHtml(chart.title)}</h3>
    <p class="muted">${escapeHtml(chart.insight)}</p>
    <div class="bars">
      ${chart.data
        .map((row, index) => {
          const label = String(row[chart.xField] ?? row.label ?? `Item ${index + 1}`);
          const value = Number(row[chart.yField] ?? row.value ?? row.count ?? 0);
          return `<div class="bar-row">
            <div class="bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatCell(value))}</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (value / max) * 100)}%"></div></div>
          </div>`;
        })
        .join("")}
    </div>
    ${sourceBadges(chart.sourceIds, evidenceById, sourceNumbers)}
  </section>`;
}

function blockHtml(
  block: ArtifactBlock,
  run: WorkRun,
  evidenceById: Map<string, EvidenceSource>,
  sourceNumbers: Map<string, number>,
) {
  if (block.type === "hero") {
    return `<header class="hero">
      <div class="eyebrow">${escapeHtml(block.eyebrow)}</div>
      <h1>${escapeHtml(block.title)}</h1>
      <p>${escapeHtml(block.subtitle)}</p>
      <dl class="meta">
        ${block.meta
          .map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
          .join("")}
        <div><dt>Audit</dt><dd>${run.audit.score}/100</dd></div>
      </dl>
    </header>`;
  }

  if (block.type === "summary") {
    return `<section class="card summary-card">
      <div class="section-kicker">${escapeHtml(block.title)}</div>
      <p class="lede">${escapeHtml(block.body)}</p>
      <ul>${block.takeaways.map((takeaway) => `<li>${escapeHtml(takeaway)}</li>`).join("")}</ul>
    </section>`;
  }

  if (block.type === "kpi_grid") {
    return `<section class="card">
      <div class="section-kicker">Key metrics</div>
      <h3>${escapeHtml(block.title)}</h3>
      <p class="muted">${escapeHtml(block.insight)}</p>
      <div class="kpis">
        ${block.items
          .map(
            (item) => `<div class="kpi"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatCell(item.value))}</strong><small>${escapeHtml(item.detail ?? "")}</small></div>`,
          )
          .join("")}
      </div>
      ${sourceBadges(block.sourceIds, evidenceById, sourceNumbers)}
    </section>`;
  }

  if (block.type === "chart") return chartHtml(block.chart, evidenceById, sourceNumbers);
  if (block.type === "table") return tableHtml(block.table, evidenceById, sourceNumbers);

  if (block.type === "finding") {
    return `<section class="card">
      <div class="section-kicker">Findings</div>
      <h3>${escapeHtml(block.title)}</h3>
      <div class="stack">${block.claims
        .map(
          (claim) => `<article class="claim ${claim.assumption || claim.citationIds.length === 0 ? "claim-needs-review" : "claim-supported"}" data-claim-id="${escapeHtml(claim.id)}">
            <p>${escapeHtml(claim.claim)}</p>
            <span>${claim.assumption ? "Assumption" : `${Math.round(claim.confidence * 100)}% confidence`}</span>
            ${sourceBadges(claim.citationIds, evidenceById, sourceNumbers)}
          </article>`,
        )
        .join("")}</div>
    </section>`;
  }

  if (block.type === "recommendation") {
    return `<section class="card">
      <div class="section-kicker">Recommendations</div>
      <h3>${escapeHtml(block.title)}</h3>
      <div class="stack">${block.recommendations
        .map(
          (recommendation) => `<article class="recommendation">
            <span class="priority">${escapeHtml(recommendation.priority)}</span>
            <div><p>${escapeHtml(recommendation.action)}</p><small>${escapeHtml(recommendation.expectedImpact)}</small>${sourceBadges(recommendation.sourceIds, evidenceById, sourceNumbers)}</div>
          </article>`,
        )
        .join("")}</div>
    </section>`;
  }

  if (block.type === "evidence") {
    return `<section class="card">
      <div class="section-kicker">Evidence</div>
      <h3>${escapeHtml(block.title)}</h3>
      <div class="stack">${block.sourceIds
        .map((sourceId) => evidenceById.get(sourceId))
        .filter(Boolean)
        .map(
          (source) => `<article class="evidence"><strong>${escapeHtml(source?.title)}</strong><p>${escapeHtml(source?.excerpt)}</p></article>`,
        )
        .join("")}</div>
    </section>`;
  }

  if (block.type === "audit") {
    return `<section class="card">
      <div class="section-kicker">Audit</div>
      <h3>${escapeHtml(block.title)}</h3>
      <div class="audit-grid">${run.audit.checklist
        .filter((check) => block.checklistIds.includes(check.id))
        .map((check) => `<div><span>${escapeHtml(check.label)}</span><strong>${check.score}</strong></div>`)
        .join("")}</div>
    </section>`;
  }

  return `<section class="card">
    <div class="section-kicker">Agent handoff</div>
    <h3>${escapeHtml(block.title)}</h3>
    <p>${escapeHtml(block.body)}</p>
  </section>`;
}

function fallbackSections(draft: DraftArtifact): ArtifactSection[] {
  return [
    {
      id: "html-fallback-cover",
      title: "Cover",
      purpose: "Brief cover",
      blocks: [
        {
          id: "html-fallback-hero",
          type: "hero",
          eyebrow: briefStyleLabel(draft.style),
          title: draft.title,
          subtitle: draft.thesis,
          meta: [
            { label: "Version", value: `v${draft.version}` },
            { label: "Created", value: new Date(draft.createdAt).toLocaleString() },
          ],
        },
        {
          id: "html-fallback-summary",
          type: "summary",
          title: "Executive summary",
          body: draft.summary,
          takeaways: draft.findings,
        },
      ],
    },
  ];
}

function collectCounts(sections: ArtifactSection[]) {
  let visualizationCount = 0;
  let tableCount = 0;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.type === "chart" || block.type === "kpi_grid") visualizationCount += 1;
      if (block.type === "table") tableCount += 1;
    }
  }
  return { visualizationCount, tableCount };
}

function collectClaims(sections: ArtifactSection[]) {
  return sections.flatMap((section) =>
    section.blocks.flatMap((block) => (block.type === "finding" ? block.claims : [])),
  );
}

function claimAuditHtml(sections: ArtifactSection[], run: WorkRun) {
  const claims = collectClaims(sections);
  const supported = claims.filter((claim) => !claim.assumption && claim.citationIds.length > 0);
  const assumptions = claims.filter((claim) => claim.assumption);
  const missingCitations = claims.filter((claim) => claim.citationIds.length === 0);
  const lowConfidence = claims.filter((claim) => claim.confidence < 0.65);

  return `<section class="claim-audit-panel" data-claim-audit>
    <div>
      <span class="section-kicker">Claims audit</span>
      <h2>${run.audit.score}/100 publish readiness</h2>
      <p>${escapeHtml(run.audit.stopReason ?? "Claims, evidence, and export readiness were checked before this artifact was finalized.")}</p>
    </div>
    <dl>
      <div><dt>Supported</dt><dd>${supported.length}</dd></div>
      <div><dt>Assumptions</dt><dd>${assumptions.length}</dd></div>
      <div><dt>Missing citations</dt><dd>${missingCitations.length}</dd></div>
      <div><dt>Low confidence</dt><dd>${lowConfidence.length}</dd></div>
    </dl>
  </section>`;
}

function designEvidenceHtml(template: BriefDesignTemplate, intent: BriefIntent) {
  return `<article>
    <strong>Design brief: ${escapeHtml(nexusArtifactDesign.label)}</strong>
    <span>${escapeHtml(nexusArtifactDesign.sourceUrl)}</span>
    <p>The standalone HTML applies the Nexus artifact presentation rules, dark report surfaces, active data accents, and evidence-led structure from the bundled design.md file. Template: ${escapeHtml(briefTemplateLabels[template])}. Intent: ${escapeHtml(briefIntentLabels[intent])}.</p>
  </article>`;
}

function templateOverviewHtml({
  template,
  intent,
  run,
  visualizationCount,
  tableCount,
}: {
  template: BriefDesignTemplate;
  intent: BriefIntent;
  run: WorkRun;
  visualizationCount: number;
  tableCount: number;
}) {
  return `<section class="template-overview">
    <div>
      <span class="section-kicker">Brief format</span>
      <h2>${escapeHtml(briefTemplateLabels[template])}</h2>
      <p>${escapeHtml(briefTemplateDescriptions[template])}</p>
    </div>
    <dl>
      <div><dt>Intent</dt><dd>${escapeHtml(briefIntentLabels[intent])}</dd></div>
      <div><dt>Audit score</dt><dd>${run.audit.score}/100</dd></div>
      <div><dt>Visuals</dt><dd>${visualizationCount}</dd></div>
      <div><dt>Tables</dt><dd>${tableCount}</dd></div>
    </dl>
  </section>`;
}

export function createBriefHtmlArtifact({
  run,
  draft,
}: {
  run: WorkRun;
  draft: DraftArtifact;
}): HtmlBriefArtifact {
  const sections = draft.artifactSections?.length ? draft.artifactSections : fallbackSections(draft);
  const evidenceById = new Map(run.evidence.map((source) => [source.id, source]));
  const sourceNumbers = new Map(run.evidence.map((source, index) => [source.id, index + 1]));
  const { visualizationCount, tableCount } = collectCounts(sections);
  const title = draft.title || run.title;
  const createdAt = new Date().toISOString();
  const briefIntent = detectBriefIntent(draft, run);
  const designTemplate = selectDesignTemplate(briefIntent, draft, run);
  const brandLockup = nexusArtifactDesign.logoUrl
    ? `<img src="${escapeHtml(nexusArtifactDesign.logoUrl)}" alt="${escapeHtml(nexusArtifactDesign.brandName)} logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
        <span class="brand-fallback" style="display:none">${escapeHtml(nexusArtifactDesign.brandName)}</span>`
    : `<span class="brand-fallback">${escapeHtml(nexusArtifactDesign.brandName)}</span>`;
  const body = sections
    .map(
      (section) => `<section class="report-section">
        ${section.title !== "Cover" ? `<div class="section-heading"><span>${escapeHtml(section.title)}</span><p>${escapeHtml(section.purpose)}</p></div>` : ""}
        ${section.blocks.map((block) => blockHtml(block, run, evidenceById, sourceNumbers)).join("")}
      </section>`,
    )
    .join("");
  const evidence = run.evidence
    .map(
      (source, index) => `<article>
        <strong>[${index + 1}] ${escapeHtml(source.title)}</strong>
        <span>${escapeHtml(source.source)} - ${Math.round(source.confidence * 100)}%</span>
        <p>${escapeHtml(source.excerpt)}</p>
      </article>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --ink:#f7fbff; --muted:#9a9aa3; --line:rgba(233,240,245,.14); --soft:#111114; --active:#03dc5d; --active-2:#00ff51; --gold:#d5a132; --slate:#132a3a; --panel:#0c1014; --base:#050506; --danger:#ff6b57; --blue:#7dd3fc; }
    * { box-sizing: border-box; }
    body { margin:0; background:radial-gradient(circle at 78% 0%, rgba(3,220,93,.15), transparent 28%), linear-gradient(180deg, #08080a 0%, var(--base) 58%, #020304 100%); color:var(--ink); font-family:"Mona Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.5; }
    main { max-width:1180px; margin:0 auto; padding:28px 24px 56px; }
    .brand-masthead { display:flex; align-items:center; justify-content:space-between; gap:18px; min-height:64px; margin-bottom:18px; border:1px solid var(--line); border-radius:8px; background:rgba(12,16,20,.84); padding:14px 16px; box-shadow:0 20px 70px rgba(0,0,0,.28); }
    .artifact-toolbar { position:sticky; top:0; z-index:8; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:18px; border:1px solid var(--line); border-radius:8px; background:rgba(5,5,6,.9); padding:10px; backdrop-filter:blur(18px); }
    .artifact-toolbar strong { font-size:13px; }
    .artifact-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .artifact-actions button { cursor:pointer; border:1px solid var(--line); border-radius:7px; background:rgba(255,255,255,.05); color:var(--ink); padding:7px 10px; font:inherit; font-size:12px; }
    .artifact-actions button[aria-pressed="true"] { border-color:rgba(3,220,93,.5); color:var(--active); background:rgba(3,220,93,.08); }
    .brand-lockup { display:flex; align-items:center; gap:14px; min-width:0; }
    .brand-lockup img { width:158px; max-width:42vw; height:auto; display:block; }
    .brand-fallback { color:var(--ink); font-size:22px; font-weight:800; letter-spacing:0; }
    .brand-meta { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; color:var(--muted); font-size:12px; }
    .brand-meta span, .source-badges span { border:1px solid var(--line); border-radius:999px; padding:4px 9px; background:rgba(255,255,255,.03); }
    .template-overview { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(360px,.9fr); gap:18px; align-items:stretch; margin-bottom:22px; border:1px solid var(--line); border-radius:8px; background:rgba(12,16,20,.72); padding:18px; }
    .template-overview h2 { margin:6px 0 0; font-size:24px; }
    .template-overview p { margin:8px 0 0; color:var(--muted); max-width:720px; }
    .template-overview dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:0; }
    .template-overview dl div { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.035); padding:12px; }
    .claim-audit-panel { display:none; grid-template-columns:minmax(0,1fr) minmax(360px,.8fr); gap:18px; align-items:stretch; margin-bottom:22px; border:1px solid rgba(213,161,50,.32); border-radius:8px; background:rgba(213,161,50,.07); padding:18px; }
    body.show-audit .claim-audit-panel { display:grid; }
    .claim-audit-panel h2 { margin:6px 0 0; font-size:24px; }
    .claim-audit-panel p { margin:8px 0 0; color:var(--muted); }
    .claim-audit-panel dl { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:0; }
    .claim-audit-panel dl div { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.04); padding:12px; }
    .hero, .card { background:linear-gradient(180deg, rgba(17,17,20,.96), rgba(12,16,20,.96)); border:1px solid var(--line); border-radius:8px; box-shadow:0 20px 70px rgba(0,0,0,.24); }
    .hero { padding:38px; position:relative; overflow:hidden; }
    .hero:before { content:""; position:absolute; inset:0 0 auto; height:4px; background:linear-gradient(90deg, var(--active), var(--gold)); }
    .eyebrow, .section-kicker { color:var(--active); font-size:12px; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:16px 0 0; max-width:880px; font-size:44px; line-height:1.03; letter-spacing:0; }
    h2, h3 { margin:8px 0 0; line-height:1.2; }
    .hero p { max-width:760px; margin:18px 0 0; color:var(--muted); font-size:18px; }
    .meta, .kpis, .audit-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:26px 0 0; }
    .meta div, .kpi, .audit-grid div { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.035); padding:14px; }
    dt, .kpi span, .audit-grid span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; }
    dd, .kpi strong, .audit-grid strong { margin:4px 0 0; display:block; font-size:20px; font-weight:750; }
    .report-section { display:grid; gap:18px; margin-top:22px; }
    .section-heading { border-bottom:1px solid var(--line); padding:10px 2px; }
    .section-heading span { color:var(--active); font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .section-heading p, .muted { margin:4px 0 0; color:var(--muted); }
    .card { padding:24px; }
    .lede { font-size:18px; line-height:1.7; }
    ul { padding-left:20px; }
    li { margin:8px 0; }
    .table-wrap { margin-top:16px; overflow-x:auto; border:1px solid var(--line); border-radius:8px; }
    table { width:100%; border-collapse:collapse; min-width:520px; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; font-size:14px; }
    th { background:rgba(19,42,58,.6); color:var(--muted); font-size:12px; text-transform:uppercase; }
    td.right { text-align:right; font-variant-numeric:tabular-nums; }
    .bars { margin-top:18px; display:grid; gap:14px; }
    .bar-label, .chart-labels div { display:flex; justify-content:space-between; gap:16px; font-size:13px; }
    .bar-track { height:10px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; }
    .bar-fill { height:100%; background:linear-gradient(90deg, var(--active), var(--gold)); border-radius:999px; }
    .line-chart { width:100%; height:260px; margin-top:18px; color:var(--active); }
    .line-chart circle { fill:var(--gold); stroke:var(--base); stroke-width:1; }
    .chart-labels { margin-top:10px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 18px; color:var(--muted); }
    .chart-labels strong { color:var(--ink); }
    .stack { display:grid; gap:12px; margin-top:16px; }
    .claim, .recommendation, .evidence { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.035); padding:14px; }
    .claim p, .recommendation p, .evidence p { margin:0; }
    .claim span, .evidence span, small { color:var(--muted); font-size:12px; }
    .recommendation { display:flex; gap:12px; }
    .priority { height:max-content; border-radius:999px; background:rgba(213,161,50,.16); color:var(--gold); border:1px solid rgba(213,161,50,.32); padding:3px 9px; font-size:12px; font-weight:700; text-transform:uppercase; }
    .source-badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
    .source-badges span { color:var(--muted); font-size:12px; display:inline-flex; gap:5px; align-items:center; }
    .source-badges strong { color:var(--active); font-weight:750; }
    body.hide-citations .source-badges { display:none; }
    body.show-audit .claim-needs-review { border-color:rgba(255,107,87,.4); background:rgba(255,107,87,.055); }
    body.show-audit .claim-supported { border-color:rgba(3,220,93,.32); background:rgba(3,220,93,.04); }
    .evidence-appendix { margin-top:24px; }
    .evidence-appendix article { border-top:1px solid var(--line); padding:12px 0; }
    .evidence-appendix strong, .evidence-appendix span { display:block; }
    .evidence-appendix span { color:var(--muted); font-size:12px; }
    footer { color:var(--muted); font-size:12px; margin-top:24px; text-align:center; }
    .template-executive-board .hero { padding:46px 42px; background:linear-gradient(135deg, rgba(17,17,20,.98), rgba(19,42,58,.72)); }
    .template-executive-board .summary-card { border-color:rgba(3,220,93,.28); }
    .template-executive-board .recommendation { background:rgba(3,220,93,.055); }
    .template-ops-command main { max-width:1280px; }
    .template-ops-command .report-section { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
    .template-ops-command .section-heading { grid-column:1 / -1; }
    .template-ops-command .hero, .template-ops-command .summary-card, .template-ops-command .table-card { grid-column:1 / -1; }
    .template-ops-command .card { padding:18px; }
    .template-ops-command h1 { font-size:38px; }
    .template-ops-command .kpis { grid-template-columns:repeat(4,minmax(140px,1fr)); }
    .template-risk-compliance { --active:var(--gold); --active-2:#f4c766; --line:rgba(213,161,50,.22); }
    .template-risk-compliance body, body.template-risk-compliance { background:linear-gradient(180deg, #080706 0%, #050506 56%, #030303 100%); }
    .template-risk-compliance .hero:before { background:linear-gradient(90deg, var(--gold), var(--danger)); }
    .template-risk-compliance .claim { border-left:3px solid var(--gold); background:rgba(213,161,50,.055); }
    .template-risk-compliance .audit-grid div { background:rgba(213,161,50,.06); }
    @media (max-width: 900px) { .template-overview { grid-template-columns:1fr; } .template-ops-command .report-section { grid-template-columns:1fr; } }
    @media (max-width: 760px) { main { padding:20px 14px 40px; } .brand-masthead, .artifact-toolbar { align-items:flex-start; flex-direction:column; } .brand-meta { justify-content:flex-start; } .hero { padding:26px; } h1 { font-size:32px; } .meta, .kpis, .audit-grid, .chart-labels, .template-overview dl, .claim-audit-panel, .claim-audit-panel dl { grid-template-columns:1fr; } }
    @media print { :root { color-scheme:light; --ink:#111318; --muted:#4f5663; --line:#d9dde4; --soft:#fff; --panel:#fff; --base:#fff; } body { background:#fff; color:var(--ink); } main { max-width:none; padding:0; } .artifact-toolbar { display:none; } .brand-masthead, .hero, .card, .template-overview, .claim-audit-panel { box-shadow:none; break-inside:avoid; background:#fff; } .report-section { break-inside:auto; } .source-badges span { border-color:#d9dde4; } }
  </style>
</head>
<body class="${templateClass(designTemplate)} show-citations">
  <main>
    <div class="artifact-toolbar" data-artifact-toolbar>
      <strong>Brief artifact delivery</strong>
      <div class="artifact-actions">
        <button type="button" data-toggle="citations" aria-pressed="true">Citations</button>
        <button type="button" data-toggle="audit" aria-pressed="false">Claims audit</button>
        <button type="button" onclick="window.print()">Export PDF</button>
      </div>
    </div>
    <div class="brand-masthead">
      <div class="brand-lockup">
        ${brandLockup}
      </div>
      <div class="brand-meta">
        <span>Model-written narrative</span>
        <span>${escapeHtml(briefTemplateLabels[designTemplate])}</span>
        <span>${escapeHtml(briefIntentLabels[briefIntent])}</span>
        <span>${visualizationCount} visuals</span>
        <span>${tableCount} tables</span>
      </div>
    </div>
    ${templateOverviewHtml({ template: designTemplate, intent: briefIntent, run, visualizationCount, tableCount })}
    ${claimAuditHtml(sections, run)}
    ${body}
    <section class="card evidence-appendix">
      <div class="section-kicker">Evidence appendix</div>
      <h3>Sources used by this HTML artifact</h3>
      ${designEvidenceHtml(designTemplate, briefIntent)}
      ${evidence || "<p class=\"muted\">No sources were attached to this artifact.</p>"}
    </section>
    <footer>Generated by Nexus from the model-written brief narrative, structured tool evidence, design.md, and visualization blocks on ${escapeHtml(new Date(createdAt).toLocaleString())}.</footer>
  </main>
  <script>
    (() => {
      const body = document.body;
      document.querySelector('[data-toggle="citations"]')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const hidden = body.classList.toggle('hide-citations');
        button.setAttribute('aria-pressed', String(!hidden));
      });
      document.querySelector('[data-toggle="audit"]')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const visible = body.classList.toggle('show-audit');
        button.setAttribute('aria-pressed', String(visible));
      });
    })();
  </script>
</body>
</html>`;

  return {
    id: `html-${draft.id}`,
    fileName: `${slugify(title)}.html`,
    title,
    html,
    createdAt,
    sourceDraftId: draft.id,
    sourceDraftVersion: draft.version,
    briefIntent,
    designTemplate,
    exportReady: true,
    deliverableFormat: "html",
    visualizationCount,
    tableCount,
    evidenceCount: run.evidence.length,
  };
}

export function attachBriefHtmlArtifact(run: WorkRun): WorkRun {
  const draft = run.drafts[run.drafts.length - 1];
  if (!draft) return run;
  const htmlArtifact = createBriefHtmlArtifact({ run, draft });
  return {
    ...run,
    drafts: [...run.drafts.slice(0, -1), { ...draft, htmlArtifact }],
    updatedAt: new Date().toISOString(),
  };
}
