import type {
  AgentDomainId,
  DatasetColumn,
  DatasetColumnType,
  DatasetRowValue,
  DatasetSemanticRole,
  ProjectDataset,
} from "@/types";

type KnowledgePackRow = Record<string, DatasetRowValue>;

export interface KnowledgePackDefinition {
  id: KnowledgePackId;
  label: string;
  domainId: AgentDomainId;
  description: string;
  sourceName: string;
  sourceUrl: string;
  license?: string;
  notes?: string;
  useCases: string[];
  rows: KnowledgePackRow[];
  roleOverrides: Partial<Record<string, DatasetSemanticRole>>;
}

export type KnowledgePackId =
  | "workforce_support_ops"
  | "banking_customer_ops"
  | "banking_sentiment_news";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function buildKnowledgePackColumns(
  rows: KnowledgePackRow[],
  explicitRoles: Partial<Record<string, DatasetSemanticRole>>,
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
      semanticRole: explicitRoles[key],
      missingRate: rows.length === 0 ? 1 : round(1 - present / rows.length),
      sampleValues,
    };
  });
}

const supportQueues = ["IT access", "Payroll", "Benefits", "CRM support", "Device support"];
const supportOwners = ["Alex", "Jordan", "Maya", "Priya", "Sam"];
const supportIssues = [
  "Cannot access the revenue dashboard after the role migration.",
  "Expense reimbursement is stuck after manager approval.",
  "New hire onboarding checklist is missing laptop shipment status.",
  "Customer handoff notes are not syncing from the CRM.",
  "VPN token reset is blocking the finance close workflow.",
];

function buildSupportRows(): KnowledgePackRow[] {
  return Array.from({ length: 30 }, (_, index) => {
    const queue = supportQueues[index % supportQueues.length];
    const priority = index % 7 === 0 ? "urgent" : index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low";
    const status = index % 6 === 0 ? "breached" : index % 4 === 0 ? "waiting_on_employee" : index % 5 === 0 ? "resolved" : "open";
    const responseMinutes = 18 + (index % 6) * 17 + (priority === "urgent" ? 25 : 0);
    const resolutionHours = status === "resolved" ? 4 + (index % 5) * 3 : 12 + (index % 8) * 6;
    return {
      ticket_id: `WF-${1000 + index}`,
      ticket_date: `2026-06-${String((index % 20) + 1).padStart(2, "0")}`,
      queue,
      owner: supportOwners[index % supportOwners.length],
      priority,
      status,
      requester_team: ["Sales", "Finance", "People", "Support", "Operations"][index % 5],
      ticket_volume: 1,
      response_minutes: responseMinutes,
      resolution_hours: resolutionHours,
      sla_breach: status === "breached" || responseMinutes > 80 ? 1 : 0,
      customer_effort_score: 2 + (index % 4),
      issue_summary: supportIssues[index % supportIssues.length],
      agent_reply:
        status === "resolved"
          ? "Resolved with a documented workaround and linked runbook."
          : "Triage complete; waiting on owner confirmation before closing.",
    };
  });
}

const bankingProducts = ["Checking", "Savings", "Credit card", "Mortgage", "Business banking"];
const bankingIssues = [
  "Customer reported repeated card declines after travel notice.",
  "Account holder cannot complete KYC refresh from mobile.",
  "Mortgage customer asked for payoff statement and escrow explanation.",
  "Business account needs entitlement review for a new finance user.",
  "Savings customer disputed an unexpected service fee.",
];

function buildBankingRows(): KnowledgePackRow[] {
  return Array.from({ length: 32 }, (_, index) => {
    const product = bankingProducts[index % bankingProducts.length];
    const tenure = 4 + (index % 18);
    const complaints = index % 8 === 0 ? 3 : index % 5 === 0 ? 2 : index % 4 === 0 ? 1 : 0;
    const riskScore = Math.min(96, 28 + complaints * 17 + (index % 6) * 5);
    const entitlementFlag = index % 6 === 0 ? 1 : 0;
    return {
      account_id: `ACCT-${42000 + index}`,
      review_date: `2026-06-${String((index % 22) + 1).padStart(2, "0")}`,
      product,
      region: ["Northeast", "South", "Midwest", "West"][index % 4],
      account_status: riskScore > 78 ? "review_required" : complaints > 0 ? "watchlist" : "healthy",
      monthly_value: 115 + (index % 9) * 42 + (product === "Mortgage" ? 260 : 0),
      balance: 1800 + index * 420 + (product === "Business banking" ? 6500 : 0),
      tenure_months: tenure,
      complaints,
      churn_risk_score: riskScore,
      kyc_refresh_due: index % 7 === 0 ? 1 : 0,
      entitlement_flag: entitlementFlag,
      complaint_note: bankingIssues[index % bankingIssues.length],
      recommended_review:
        riskScore > 78
          ? "Compliance review and retention outreach required before next cycle."
          : complaints > 0
            ? "Route to account ops for service recovery follow-up."
            : "No immediate escalation; keep in standard monitoring.",
    };
  });
}

const sentimentHeadlines = [
  "Regional banks rise as deposit outflows slow for a second week.",
  "Payment processor warns merchants about higher dispute volumes.",
  "Regulators publish new guidance on digital account onboarding.",
  "Major lender expands small business credit line availability.",
  "Analysts cut outlook for consumer credit after delinquency uptick.",
  "Treasury yields ease as financial stocks recover early losses.",
];

function buildSentimentRows(): KnowledgePackRow[] {
  return Array.from({ length: 30 }, (_, index) => {
    const sentiment = index % 6 === 4 ? "negative" : index % 3 === 0 ? "positive" : "neutral";
    const impact = sentiment === "positive" ? 72 + (index % 5) * 4 : sentiment === "negative" ? 58 + (index % 4) * 6 : 44 + (index % 3) * 5;
    return {
      headline_id: `FN-${7000 + index}`,
      published_date: `2026-06-${String((index % 18) + 1).padStart(2, "0")}`,
      topic: ["Deposits", "Payments", "Regulation", "Credit", "Markets"][index % 5],
      source_channel: ["Wire", "Analyst note", "Regulatory update", "Industry blog"][index % 4],
      sentiment,
      sentiment_score: sentiment === "positive" ? 0.7 + (index % 3) * 0.08 : sentiment === "negative" ? -0.74 + (index % 3) * 0.07 : 0.05,
      relevance_score: impact,
      compliance_watch: index % 5 === 2 ? 1 : 0,
      headline: sentimentHeadlines[index % sentimentHeadlines.length],
      brief_note:
        sentiment === "negative"
          ? "Use this as risk context and check whether support scripts need compliance review."
          : sentiment === "positive"
            ? "Use this as market context for opportunity framing."
            : "Use this as neutral background context; avoid over-weighting it.",
    };
  });
}

export const knowledgePacks: KnowledgePackDefinition[] = [
  {
    id: "workforce_support_ops",
    label: "Workforce Support Ops",
    domainId: "general",
    description: "Internal ticket operations with queues, SLA pressure, owners, priorities, and natural ticket text.",
    sourceName: "Hugging Face: Tobi-Bueck/customer-support-tickets",
    sourceUrl: "https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets",
    notes: "Bundled rows are a small synthetic enterprise snapshot modeled after public support-ticket fields; no real personal data is included.",
    useCases: ["Internal workforce ops brief", "SLA risk review", "Support queue staffing", "Follow-up planning"],
    rows: buildSupportRows(),
    roleOverrides: {
      ticket_date: "date",
      ticket_id: "entity",
      queue: "category",
      owner: "owner",
      priority: "priority",
      status: "status",
      requester_team: "channel",
      ticket_volume: "sales",
      response_minutes: "engagement",
      resolution_hours: "engagement",
      sla_breach: "discount",
      customer_effort_score: "score",
    },
  },
  {
    id: "banking_customer_ops",
    label: "Banking Customer Ops",
    domainId: "general",
    description: "Account operations and churn-risk context with products, balances, complaints, KYC flags, and entitlement review.",
    sourceName: "Kaggle: Bank Customer Churn Prediction",
    sourceUrl: "https://www.kaggle.com/datasets/radheshyamkollipara/bank-customer-churn",
    notes: "Kaggle is referenced for public schema inspiration; bundled rows are curated demo records and avoid live Kaggle fetching.",
    useCases: ["Banking account-health brief", "KYC operations review", "Entitlement escalation", "Retention and complaint triage"],
    rows: buildBankingRows(),
    roleOverrides: {
      account_id: "entity",
      review_date: "date",
      product: "product",
      region: "category",
      account_status: "status",
      monthly_value: "revenue",
      balance: "revenue",
      complaints: "discount",
      churn_risk_score: "score",
      kyc_refresh_due: "discount",
      entitlement_flag: "discount",
    },
  },
  {
    id: "banking_sentiment_news",
    label: "Banking Sentiment News",
    domainId: "general",
    description: "Financial headline sentiment and compliance-watch context for banking market or risk briefs.",
    sourceName: "Hugging Face: takala/financial_phrasebank",
    sourceUrl: "https://huggingface.co/datasets/takala/financial_phrasebank",
    license: "Research dataset; review upstream terms before production reuse.",
    notes: "Bundled rows are small synthetic headline snapshots modeled after financial sentiment classification tasks.",
    useCases: ["Market dossier", "Compliance monitoring brief", "Customer comms context", "Risk narrative support"],
    rows: buildSentimentRows(),
    roleOverrides: {
      headline_id: "entity",
      published_date: "date",
      topic: "category",
      source_channel: "channel",
      sentiment: "status",
      sentiment_score: "score",
      relevance_score: "engagement",
      compliance_watch: "discount",
    },
  },
];

export function createKnowledgePackDataset(projectId: string, packId: KnowledgePackId): ProjectDataset {
  const pack = knowledgePacks.find((item) => item.id === packId);
  if (!pack) {
    throw new Error(`Unknown knowledge pack: ${packId}`);
  }

  const timestamp = new Date().toISOString();
  const rows = pack.rows.map((row) => ({ ...row }));
  return {
    id: id("dataset"),
    projectId,
    name: pack.label,
    domainId: pack.domainId,
    sourceKind: "mock",
    sourceMetadata: {
      kind: "knowledge_pack",
      packId: pack.id,
      label: pack.label,
      sourceName: pack.sourceName,
      sourceUrl: pack.sourceUrl,
      license: pack.license,
      notes: pack.notes,
      useCases: pack.useCases,
    },
    columns: buildKnowledgePackColumns(rows, pack.roleOverrides),
    rows,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
