import nexusDesignMarkdown from "./design.md?raw";
import type { BriefDesignTemplate, BriefIntent } from "@/types";

export const briefIntentLabels: Record<BriefIntent, string> = {
  executive_decision: "Executive decision",
  operational_review: "Operational review",
  risk_compliance: "Risk & compliance",
  market_intelligence: "Market intelligence",
  performance_snapshot: "Performance snapshot",
  action_plan: "Action plan",
};

export const briefTemplateLabels: Record<BriefDesignTemplate, string> = {
  executive_board: "Executive Board Brief",
  ops_command: "Ops Command Review",
  risk_compliance: "Risk & Compliance Memo",
};

export const briefTemplateDescriptions: Record<BriefDesignTemplate, string> = {
  executive_board:
    "Recommendation-first leadership report with a board masthead, KPI strip, decision logic, and crisp next moves.",
  ops_command:
    "Dense operating readout with compact metric bands, status-forward sections, tables, and execution follow-through.",
  risk_compliance:
    "Audit-forward memo emphasizing assumptions, source quality, control gaps, checklist scores, and conservative actions.",
};

export const nexusArtifactDesign = {
  id: "nexus-html-brief",
  label: "Nexus HTML brief design",
  brandName: "Nexus",
  siteUrl: "",
  logoUrl: "",
  sourceUrl: "design.md",
  markdown: nexusDesignMarkdown,
  palette: {
    base: "#050506",
    panel: "#0c1014",
    elevated: "#111114",
    green: "#03dc5d",
    electric: "#00ff51",
    gold: "#d5a132",
    slate: "#132a3a",
    mist: "#e9f0f5",
    muted: "#9a9aa3",
  },
  intents: briefIntentLabels,
  templates: briefTemplateLabels,
  templateDescriptions: briefTemplateDescriptions,
};
