import type { LucideIcon } from "lucide-react";

export type PortKind = "text" | "json" | "tool" | "policy" | "memory";
export type NodeStatus = "draft" | "incomplete" | "ready" | "live" | "blocked" | "running";
export type BuilderMode = "build" | "preview" | "evaluate" | "code";
export type NodePanel = "ai" | "action" | "time" | "review";
export type LibraryMenu = "templates" | "packs" | "agents" | "tools" | "governance" | "data";
export type AgentRiskTier = "low" | "medium" | "high";
export type AgentRole = "orchestrator" | "inspector" | "specialist" | "reviewer" | "finisher";
export type OrchestrationStrategy = "manager-led";
export type DeploymentTargetId =
  | "internal-workspace"
  | "team-assistant"
  | "tool-runner"
  | "customer-channel";

export interface DeploymentTarget {
  id: DeploymentTargetId;
  label: string;
  description: string;
  status: "available" | "locked";
  requiredControls: string[];
}

export interface ApprovalPolicy {
  mode: "none" | "human-review" | "manager-review" | "compliance-review";
  approver: string;
  requiredFor: string;
}

export interface DataAccessPolicy {
  classification: "public" | "internal" | "confidential" | "restricted";
  sources: string;
  retention: string;
}

export interface EvaluationConfig {
  suite: string;
  required: boolean;
  criteria: string[];
}

export interface IterationPolicy {
  maxIterations: number;
  successCriteria: string;
  failurePath: string;
}

export interface SpecialistAgent {
  id: string;
  name: string;
  domain: string;
  description: string;
  tools: string[];
  dataPolicy: DataAccessPolicy;
  approvalPolicy: ApprovalPolicy;
  handoffRules: string;
}

export interface NodeConfigItem {
  label: string;
  value: string;
}

export interface LibraryNode {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: LucideIcon;
  inputs: PortKind[];
  outputs: PortKind[];
  requiredConfig: string[];
  outputSchema: string;
  risk: AgentRiskTier;
}

export interface AgentGraphNode extends LibraryNode {
  id: string;
  templateId: string;
  x: number;
  y: number;
  status: NodeStatus;
  panel: NodePanel;
  purpose: string;
  instructions: string;
  config: NodeConfigItem[];
  dataAccess: DataAccessPolicy;
  approval: ApprovalPolicy;
  evaluation: EvaluationConfig;
  deploymentTargets: DeploymentTargetId[];
  agentRole: AgentRole;
  specialist?: SpecialistAgent;
  orchestrationStrategy?: OrchestrationStrategy;
  delegationRule: string;
  iteration: IterationPolicy;
  handoffRule: string;
}

export interface Edge {
  from: string;
  to: string;
  kind: PortKind;
}

export interface AgentBlueprint {
  id: string;
  name: string;
  description: string;
  domainPackId: string;
  version: number;
  status: "draft" | "ready" | "published";
  riskTier: AgentRiskTier;
  deploymentTargets: DeploymentTargetId[];
  orchestrationStrategy: OrchestrationStrategy;
  specialists: SpecialistAgent[];
  nodes: AgentGraphNode[];
  edges: Edge[];
  evaluations: EvaluationConfig[];
}

export interface AgentDomainPack {
  id: string;
  label: string;
  description: string;
  defaultNodeIds: string[];
  requiredControls: string[];
  riskTier: AgentRiskTier;
}
