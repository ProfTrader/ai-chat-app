import { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  ViewportPortal,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Code2,
  Clock3,
  CopyPlus,
  Download,
  FileSearch,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers3,
  ListChecks,
  MessageSquare,
  MonitorPlay,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sigma,
  Sparkles,
  Trash2,
  UserCheck,
  Variable,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PortKind = "text" | "json" | "tool" | "policy" | "memory";
type NodeStatus = "draft" | "incomplete" | "ready" | "live" | "blocked" | "running";
type BuilderMode = "build" | "preview" | "evaluate" | "code";
type NodePanel = "ai" | "action" | "time" | "review";
type LibraryMenu = "templates" | "agents" | "automations" | "logic" | "data";

interface LibraryNode {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: LucideIcon;
  inputs: PortKind[];
  outputs: PortKind[];
  requiredConfig: string[];
  outputSchema: string;
  risk: "low" | "medium" | "high";
}

interface NodeConfigItem {
  label: string;
  value: string;
}

interface GraphNode extends LibraryNode {
  id: string;
  templateId: string;
  x: number;
  y: number;
  status: NodeStatus;
  panel: NodePanel;
  purpose: string;
  instructions: string;
  config: NodeConfigItem[];
}

interface Edge {
  from: string;
  to: string;
  kind: PortKind;
}

type AgentNodeData = Record<string, unknown> & {
  graph: GraphNode;
  issues: string[];
  onPanelChange?: (nodeId: string, panel: NodePanel) => void;
};

type AgentFlowNode = FlowNode<AgentNodeData, "agentNode">;
type AgentFlowEdge = FlowEdge<{ kind: PortKind }>;

const portTone: Record<PortKind, string> = {
  text: "bg-active",
  json: "bg-fin",
  tool: "bg-success",
  policy: "bg-destructive",
  memory: "bg-muted-foreground",
};

const statusTone: Record<
  NodeStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  incomplete: "destructive",
  ready: "secondary",
  live: "default",
  blocked: "destructive",
  running: "default",
};

const nodePanels: { id: NodePanel; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "action", label: "Action" },
  { id: "time", label: "Time" },
  { id: "review", label: "Review" },
];

const libraryMenus: { id: LibraryMenu; label: string; categories: string[] }[] = [
  { id: "templates", label: "Templates", categories: [] },
  { id: "agents", label: "Agents", categories: ["Core", "Safety"] },
  { id: "automations", label: "Automation", categories: ["Tool", "Automation", "Output"] },
  { id: "logic", label: "Logic", categories: ["Logic"] },
  { id: "data", label: "Data", categories: ["Data"] },
];

const libraryNodes: LibraryNode[] = [
  {
    id: "start",
    title: "Start",
    category: "Core",
    description: "Defines workflow inputs and exposes typed user input variables.",
    icon: Play,
    inputs: [],
    outputs: ["text", "json"],
    requiredConfig: ["Input variable", "State variables"],
    outputSchema: "{ input_as_text: string, conversation_id: string }",
    risk: "low",
  },
  {
    id: "agent",
    title: "Agent",
    category: "Core",
    description: "Defines instructions, model behavior, tools, and output shape.",
    icon: Bot,
    inputs: ["text", "json", "memory", "policy"],
    outputs: ["json", "text"],
    requiredConfig: ["Model", "Instructions", "Output schema"],
    outputSchema: "{ response: string, intent: enum, confidence: number }",
    risk: "medium",
  },
  {
    id: "note",
    title: "Note",
    category: "Core",
    description: "Adds team commentary without changing the workflow execution.",
    icon: MessageSquare,
    inputs: [],
    outputs: [],
    requiredConfig: ["Comment"],
    outputSchema: "non-executable",
    risk: "low",
  },
  {
    id: "file-search",
    title: "File search",
    category: "Tool",
    description: "Retrieves knowledge from indexed files or vector stores.",
    icon: FileSearch,
    inputs: ["text"],
    outputs: ["json"],
    requiredConfig: ["Vector store", "Query"],
    outputSchema: "{ results: Array<{ title: string, excerpt: string }> }",
    risk: "medium",
  },
  {
    id: "mcp",
    title: "MCP tool",
    category: "Tool",
    description: "Calls an external connector or server with scoped approvals.",
    icon: Wrench,
    inputs: ["json", "tool", "policy"],
    outputs: ["json"],
    requiredConfig: ["Server", "Tool", "Approval"],
    outputSchema: "{ status: enum, payload: object, audit_id: string }",
    risk: "high",
  },
  {
    id: "guardrail",
    title: "Guardrail",
    category: "Safety",
    description: "Checks PII, jailbreaks, hallucinations, and misuse conditions.",
    icon: ShieldCheck,
    inputs: ["text", "json"],
    outputs: ["policy"],
    requiredConfig: ["PII", "Jailbreak", "Failure path"],
    outputSchema: "{ pass: boolean, reason: string, redactions: string[] }",
    risk: "medium",
  },
  {
    id: "if-else",
    title: "If / else",
    category: "Logic",
    description: "Routes the workflow based on a structured condition.",
    icon: GitBranch,
    inputs: ["json", "policy"],
    outputs: ["json"],
    requiredConfig: ["Condition", "Else path"],
    outputSchema: "{ branch: enum, reason: string }",
    risk: "medium",
  },
  {
    id: "while",
    title: "While",
    category: "Logic",
    description: "Loops until a condition is false or a max iteration limit is reached.",
    icon: RefreshCw,
    inputs: ["json"],
    outputs: ["json"],
    requiredConfig: ["Condition", "Max iterations"],
    outputSchema: "{ continue: boolean, iteration: number, state: object }",
    risk: "medium",
  },
  {
    id: "wait",
    title: "Wait / schedule",
    category: "Automation",
    description: "Pauses, delays, or schedules the next step in an agent workflow.",
    icon: Clock3,
    inputs: ["json"],
    outputs: ["json"],
    requiredConfig: ["Delay", "Timezone", "Resume condition"],
    outputSchema: "{ resume_at: string, timezone: string, state: object }",
    risk: "low",
  },
  {
    id: "human-approval",
    title: "Human approval",
    category: "Logic",
    description: "Pauses high-impact actions until a person approves them.",
    icon: UserCheck,
    inputs: ["json", "text"],
    outputs: ["policy"],
    requiredConfig: ["Approval prompt", "Rejected path"],
    outputSchema: "{ approved: boolean, approver_id: string, comment: string }",
    risk: "low",
  },
  {
    id: "transform",
    title: "Transform",
    category: "Data",
    description: "Reshapes outputs into a stricter schema for downstream nodes.",
    icon: Sigma,
    inputs: ["json"],
    outputs: ["json"],
    requiredConfig: ["Input shape", "Output shape"],
    outputSchema: "{ normalized: object, errors: string[] }",
    risk: "low",
  },
  {
    id: "set-state",
    title: "Set state",
    category: "Data",
    description: "Stores reusable workflow variables for later steps.",
    icon: Variable,
    inputs: ["json", "memory"],
    outputs: ["memory"],
    requiredConfig: ["State key", "Retention"],
    outputSchema: "{ key: string, value: object, expires_at: string }",
    risk: "low",
  },
  {
    id: "response",
    title: "Response",
    category: "Output",
    description: "Returns a final chat answer, task update, or draft artifact.",
    icon: Send,
    inputs: ["text", "json", "policy"],
    outputs: ["text"],
    requiredConfig: ["Format", "Review policy"],
    outputSchema: "{ message: string, next_action: string }",
    risk: "medium",
  },
];

const initialNodes: GraphNode[] = [
  {
    ...libraryNodes[0],
    id: "n1",
    templateId: "start",
    title: "Conversation start",
    x: 72,
    y: 86,
    status: "live",
    panel: "ai",
    purpose: "Accept the incoming customer message and expose the text and state variables for the workflow.",
    instructions: "Capture the latest user message as input_as_text and preserve the conversation id for downstream steps.",
    config: [
      { label: "Input variable", value: "input_as_text" },
      { label: "State variables", value: "conversation_id, project_id" },
    ],
  },
  {
    ...libraryNodes[5],
    id: "n2",
    templateId: "guardrail",
    title: "Input guardrail",
    x: 392,
    y: 54,
    status: "running",
    panel: "review",
    purpose: "Sanitize incoming text and block unsafe requests before tool or agent execution.",
    instructions: "Detect prompt injection, redact sensitive personal data, and send failures to a safe response branch.",
    config: [
      { label: "PII", value: "Redact before model context" },
      { label: "Jailbreak", value: "Block and explain" },
      { label: "Failure path", value: "Safe response" },
    ],
  },
  {
    ...libraryNodes[1],
    id: "n3",
    templateId: "agent",
    title: "Triage agent",
    x: 392,
    y: 256,
    status: "ready",
    panel: "ai",
    purpose: "Classify the request, choose a next action, and prepare structured output for routing.",
    instructions: "Use only sanitized inputs, classify intent, include confidence, and avoid freeform tool instructions.",
    config: [
      { label: "Model", value: "Ollama local" },
      { label: "Instructions", value: "Classify and summarize" },
      { label: "Output schema", value: "intent, confidence, summary" },
    ],
  },
  {
    ...libraryNodes[6],
    id: "n4",
    templateId: "if-else",
    title: "Intent router",
    x: 724,
    y: 146,
    status: "ready",
    panel: "action",
    purpose: "Choose the next branch after context and policy checks finish.",
    instructions: "Route to a reply, follow-up task, escalation, or clarification based on structured intent fields.",
    config: [
      { label: "Condition", value: "intent in [reply, task, escalate]" },
      { label: "Else path", value: "Ask clarifying question" },
    ],
  },
  {
    ...libraryNodes[9],
    id: "n5",
    templateId: "human-approval",
    title: "Review before action",
    x: 1056,
    y: 90,
    status: "draft",
    panel: "review",
    purpose: "Pause external writes and customer-facing sends until a human explicitly approves.",
    instructions: "Show the proposed action, affected record, and generated copy. Continue only after approval.",
    config: [
      { label: "Approval prompt", value: "Approve this customer-facing action?" },
      { label: "Rejected path", value: "Return draft to agent" },
    ],
  },
  {
    ...libraryNodes[4],
    id: "n6",
    templateId: "mcp",
    title: "Create follow-up task",
    x: 1056,
    y: 292,
    status: "incomplete",
    panel: "action",
    purpose: "",
    instructions: "",
    config: [
      { label: "Server", value: "Nexus local tools" },
      { label: "Tool", value: "Task writer" },
      { label: "Approval", value: "" },
    ],
  },
];

const initialEdges: Edge[] = [
  { from: "n1", to: "n2", kind: "text" },
  { from: "n2", to: "n3", kind: "policy" },
  { from: "n3", to: "n4", kind: "json" },
  { from: "n4", to: "n5", kind: "json" },
  { from: "n5", to: "n6", kind: "policy" },
];

const runEvents = [
  { label: "Conversation start", state: "complete", time: "12 ms" },
  { label: "Input guardrail", state: "running", time: "87 ms" },
  { label: "Triage agent", state: "queued", time: "next" },
  { label: "Review before action", state: "waiting", time: "human" },
];

const builderModes: {
  id: BuilderMode;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "build", label: "Build", icon: Layers3 },
  { id: "preview", label: "Preview", icon: MonitorPlay },
  { id: "evaluate", label: "Evaluate", icon: FlaskConical },
  { id: "code", label: "Code", icon: Code2 },
];

const workflowTemplates = [
  {
    label: "Support triage",
    description: "Start, guardrail, agent, approval, and task write.",
    nodeIds: ["start", "guardrail", "agent", "if-else", "human-approval", "mcp", "response"],
  },
  {
    label: "Research assistant",
    description: "Search files, transform results, then draft a response.",
    nodeIds: ["start", "file-search", "transform", "agent", "response"],
  },
  {
    label: "Safe tool action",
    description: "Route intent through approval before any external tool call.",
    nodeIds: ["start", "agent", "if-else", "human-approval", "mcp"],
  },
];

const riskTone: Record<LibraryNode["risk"], "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

function createDraftNode(
  template: LibraryNode,
  index: number,
  position?: { x: number; y: number },
): GraphNode {
  return {
    ...template,
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    templateId: template.id,
    title: template.title,
    x: position?.x ?? 128 + (index % 4) * 280,
    y: position?.y ?? 430 + Math.floor(index / 4) * 180,
    status: "draft",
    panel:
      template.category === "Tool" || template.category === "Output"
        ? "action"
        : template.category === "Logic" || template.category === "Automation"
          ? "time"
          : template.category === "Safety"
            ? "review"
            : "ai",
    purpose: "",
    instructions: "",
    config: template.requiredConfig.map((label) => ({ label, value: "" })),
  };
}

function validateNode(node: GraphNode, edges: Edge[], nodes: GraphNode[]) {
  const issues: string[] = [];
  const incomingEdges = edges.filter((edge) => edge.to === node.id);
  const hasIncoming = edges.some((edge) => edge.to === node.id);
  const hasOutgoing = edges.some((edge) => edge.from === node.id);

  if (!node.title.trim()) issues.push("Add a node name.");
  if (node.purpose.trim().length < 12) {
    issues.push("Describe the node purpose in at least 12 characters.");
  }
  if (node.templateId !== "note" && node.instructions.trim().length < 20) {
    issues.push("Add operating instructions in at least 20 characters.");
  }
  if (node.templateId !== "note" && node.outputs.length === 0) {
    issues.push("Executable nodes must expose at least one output port.");
  }
  if (!node.outputSchema.trim() || node.outputSchema === "non-executable") {
    if (node.templateId !== "note") {
      issues.push("Define a structured output schema for downstream nodes.");
    }
  }
  if (node.templateId !== "start" && node.templateId !== "note" && !hasIncoming) {
    issues.push("Connect this node to an upstream node before making it live.");
  }
  if (node.templateId === "start" && hasIncoming) {
    issues.push("Start nodes cannot have upstream connections.");
  }
  if (node.templateId !== "response" && node.templateId !== "note" && !hasOutgoing) {
    issues.push("Connect this node to a downstream step before making it live.");
  }

  for (const item of node.config) {
    if (!item.value.trim()) issues.push(`Set ${item.label}.`);
  }

  if (node.templateId === "agent") {
    const schema = node.config.find((item) => item.label === "Output schema")?.value ?? "";
    if (!schema.includes(",") && !schema.includes("{")) {
      issues.push("Agent nodes need a structured output schema, not only freeform text.");
    }
  }

  if (node.templateId === "mcp") {
    const approval = node.config.find((item) => item.label === "Approval")?.value ?? "";
    const approvedByNode = incomingEdges.some((edge) => {
      const upstream = nodes.find((candidate) => candidate.id === edge.from);
      return (
        upstream?.templateId === "human-approval" &&
        upstream.status !== "draft" &&
        upstream.status !== "incomplete"
      );
    });
    if (
      !approval.toLowerCase().includes("required") &&
      !approval.toLowerCase().includes("on") &&
      !approvedByNode
    ) {
      issues.push("MCP tool nodes need explicit approval or a Human approval node before writes.");
    }
  }

  if (node.templateId === "guardrail") {
    const failurePath = node.config.find((item) => item.label === "Failure path")?.value ?? "";
    if (!failurePath.trim()) {
      issues.push("Guardrails need a failure path for blocked or redacted input.");
    }
  }

  if (node.templateId === "while") {
    const maxIterations = node.config.find((item) => item.label === "Max iterations")?.value ?? "";
    if (!/\d/.test(maxIterations)) {
      issues.push("While nodes need a numeric max iteration limit.");
    }
  }

  return issues;
}

function getPortColor(kind: PortKind) {
  void kind;
  return "#b9bcc3";
}

function createFlowNode(graph: GraphNode): AgentFlowNode {
  return {
    id: graph.id,
    type: "agentNode",
    position: { x: graph.x, y: graph.y },
    data: { graph, issues: [] },
    width: 270,
  };
}

function createFlowEdge(edge: Edge): AgentFlowEdge {
  return {
    id: `${edge.from}-${edge.to}-${edge.kind}-${Date.now().toString(36)}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: "main-output",
    targetHandle: "main-input",
    type: "smoothstep",
    animated: false,
    data: { kind: edge.kind },
    style: { stroke: getPortColor(edge.kind), strokeWidth: 1.4 },
  };
}

function toGraphEdges(edges: AgentFlowEdge[]): Edge[] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    kind: edge.data?.kind ?? "json",
  }));
}

function AgentBuilderFlowNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const node = data.graph;
  const issues = data.issues;
  const Icon = node.icon;
  const panelCopy: Record<NodePanel, string> = {
    ai: node.templateId === "agent" ? "Generate reasoning or draft output" : "Use AI to shape this step",
    action: node.templateId === "mcp" ? "Run an approved tool action" : "Create an automation action",
    time: node.templateId === "while" ? "Loop with a limit" : "Schedule, wait, or delay",
    review: node.templateId === "guardrail" ? "Check safety before continuing" : "Require review when needed",
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-[240px] max-w-[340px] flex-col gap-3 rounded-md border bg-card p-3 text-card-foreground shadow-sm transition-colors",
        selected ? "border-active ring-2 ring-active/20" : "border-border",
        issues.length > 0 && node.status !== "draft" && "border-destructive/70",
      )}
    >
      <NodeResizer
        nodeId={node.id}
        isVisible={selected}
        minWidth={240}
        minHeight={150}
        lineClassName="border-active"
        handleClassName="border-active bg-background"
      />

      {node.inputs.length > 0 && (
        <Handle
          id="main-input"
          type="target"
          position={Position.Left}
          style={{
            top: "50%",
            background: getPortColor(node.inputs[0]),
            borderColor: "var(--background)",
            height: 12,
            width: 12,
          }}
        />
      )}
      {node.outputs.length > 0 && (
        <Handle
          id="main-output"
          type="source"
          position={Position.Right}
          style={{
            top: "50%",
            background: getPortColor(node.outputs[0]),
            borderColor: "var(--background)",
            height: 12,
            width: 12,
          }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
          <Icon />
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {issues.length > 0 && node.status !== "draft" && (
            <Badge variant="destructive">{issues.length}</Badge>
          )}
          <Badge variant={statusTone[node.status]}>{node.status}</Badge>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{node.title || "Untitled node"}</p>
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
          {node.purpose || node.description}
        </p>
      </div>
      <div className="nodrag flex rounded-md border border-border bg-background p-0.5">
        {nodePanels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onPanelChange?.(node.id, panel.id);
            }}
            className={cn(
              "flex-1 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              node.panel === panel.id && "bg-muted text-foreground",
            )}
          >
            {panel.label}
          </button>
        ))}
      </div>
      <div className="rounded-md bg-muted px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
        {panelCopy[node.panel]}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        {[
          node.inputs.length > 0 ? `In: ${node.inputs.join("/")}` : "No input",
          node.outputs.length > 0 ? `Out: ${node.outputs.join("/")}` : "No output",
        ].map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  agentNode: AgentBuilderFlowNode,
} satisfies NodeTypes;

function FlowConnectionLines({
  edges,
  nodes,
}: {
  edges: AgentFlowEdge[];
  nodes: AgentFlowNode[];
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <ViewportPortal>
      <svg
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        aria-hidden="true"
      >
        {edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);
          if (!source || !target) return null;

          const sourceWidth = source.width ?? source.measured?.width ?? 270;
          const sourceHeight = source.height ?? source.measured?.height ?? 230;
          const targetHeight = target.height ?? target.measured?.height ?? 230;
          const startX = source.position.x + sourceWidth;
          const startY = source.position.y + sourceHeight / 2;
          const endX = target.position.x;
          const endY = target.position.y + targetHeight / 2;
          const forwardDistance = Math.max(48, (endX - startX) / 2);
          const midX = startX <= endX ? startX + forwardDistance : startX + 72;
          const path =
            startX <= endX
              ? `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`
              : `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;

          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke="#b9bcc3"
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth="1.4"
            />
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

const initialFlowNodes = initialNodes.map(createFlowNode);
initialFlowNodes.forEach((node) => {
  node.selected = node.id === "n6";
});
const initialFlowEdges = initialEdges.map(createFlowEdge);

export function NodeManager() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<BuilderMode>("build");
  const [libraryMenu, setLibraryMenu] = useState<LibraryMenu>("templates");
  const [quickNodeTemplateId, setQuickNodeTemplateId] = useState("agent");
  const flowPaneRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<AgentFlowNode, AgentFlowEdge> | null>(null);
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<AgentFlowNode>(initialFlowNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] =
    useEdgesState<AgentFlowEdge>(initialFlowEdges);
  const [selectedNodeId, setSelectedNodeId] = useState("n6");
  const [connectFromId, setConnectFromId] = useState("n4");
  const [connectKind, setConnectKind] = useState<PortKind>("json");
  const [publishedVersion, setPublishedVersion] = useState(1);
  const [lastPublishedAt, setLastPublishedAt] = useState("Draft autosaved");
  const [sampleInput, setSampleInput] = useState(
    "Customer asks for renewal pricing and wants a follow-up task if finance approval is needed.",
  );

  const nodes = useMemo(
    () =>
      flowNodes.map((node) => ({
        ...node.data.graph,
        x: node.position.x,
        y: node.position.y,
      })),
    [flowNodes],
  );
  const edges = useMemo(() => toGraphEdges(flowEdges), [flowEdges]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = nodesById.get(selectedNodeId) ?? nodes[0];
  const selectedIssues = selectedNode ? validateNode(selectedNode, edges, nodes) : [];
  const nodeIssuesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, validateNode(node, edges, nodes)])),
    [edges, nodes],
  );
  const workflowIssues = nodes
    .filter((node) => node.status !== "draft")
    .flatMap((node) => nodeIssuesById.get(node.id) ?? []).length;
  const draftIssues = nodes
    .filter((node) => node.status === "draft")
    .flatMap((node) => nodeIssuesById.get(node.id) ?? []).length;
  const liveNodes = nodes.filter((node) => node.status === "live").length;

  const activeLibraryMenu = libraryMenus.find((item) => item.id === libraryMenu) ?? libraryMenus[0];
  const filteredLibrary = libraryNodes.filter((node) => {
    const matchesQuery = `${node.title} ${node.category} ${node.description}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesMenu =
      query.trim().length > 0 ||
      activeLibraryMenu.categories.includes(node.category);
    return matchesQuery && matchesMenu;
  });

  const updateNodePanel = useCallback(
    (nodeId: string, panel: NodePanel) => {
      setSelectedNodeId(nodeId);
      setFlowNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                selected: true,
                data: {
                  ...node.data,
                  graph: { ...node.data.graph, panel },
                },
              }
            : { ...node, selected: false },
        ),
      );
    },
    [setFlowNodes],
  );

  const renderedFlowNodes = useMemo(
    () =>
      flowNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          issues: nodeIssuesById.get(node.id) ?? [],
          onPanelChange: updateNodePanel,
        },
      })),
    [flowNodes, nodeIssuesById, updateNodePanel],
  );

  const selectFlowNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setFlowNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        })),
      );
    },
    [setFlowNodes],
  );

  const getCanvasCenterPosition = useCallback(() => {
    const rect = flowPaneRef.current?.getBoundingClientRect();
    if (!rect || !flowInstance) {
      return { x: 160 + nodes.length * 24, y: 160 + nodes.length * 18 };
    }

    return flowInstance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [flowInstance, nodes.length]);

  const updateSelectedNode = (patch: Partial<GraphNode>) => {
    setFlowNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                graph: { ...node.data.graph, ...patch },
              },
            }
          : node,
      ),
    );
  };

  const updateConfigValue = (label: string, value: string) => {
    if (!selectedNode) return;
    updateSelectedNode({
      config: selectedNode.config.map((item) =>
        item.label === label ? { ...item, value } : item,
      ),
    });
  };

  const addNode = (template: LibraryNode) => {
    const draft = createDraftNode(template, nodes.length, getCanvasCenterPosition());
    setFlowNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...createFlowNode(draft), selected: true },
    ]);
    setSelectedNodeId(draft.id);
    setConnectFromId(nodes[nodes.length - 1]?.id ?? "n1");
    setMode("build");
  };

  const addQuickNode = () => {
    const template = libraryNodes.find((node) => node.id === quickNodeTemplateId) ?? libraryNodes[1];
    addNode(template);
  };

  const addTemplate = (template: (typeof workflowTemplates)[number]) => {
    const center = getCanvasCenterPosition();
    const baseX = center.x - 360;
    const baseY = center.y - 120;
    const templateNodes = template.nodeIds
      .map((templateId, index) => {
        const libraryNode = libraryNodes.find((node) => node.id === templateId);
        if (!libraryNode) return null;
        return {
          ...createDraftNode(libraryNode, nodes.length + index),
          id: `template-${Date.now().toString(36)}-${index}`,
          title: `${libraryNode.title} (${template.label})`,
          x: baseX + index * 260,
          y: baseY + (index % 2) * 170,
        };
      })
      .filter((node): node is GraphNode => Boolean(node));

    const templateEdges: Edge[] = templateNodes.slice(1).map((node, index) => {
      const from = templateNodes[index];
      const kind = from.outputs.find((output) => node.inputs.includes(output)) ?? from.outputs[0] ?? "json";
      return { from: from.id, to: node.id, kind };
    });

    setFlowNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...templateNodes.map((node, index) => ({
        ...createFlowNode(node),
        selected: index === 0,
      })),
    ]);
    setFlowEdges((current) => [...current, ...templateEdges.map(createFlowEdge)]);
    setSelectedNodeId(templateNodes[0]?.id ?? selectedNodeId);
    setMode("build");
  };

  const keepDraft = () => {
    updateSelectedNode({ status: "draft" });
  };

  const validateSelected = () => {
    if (!selectedNode) return;
    updateSelectedNode({ status: selectedIssues.length > 0 ? "incomplete" : "ready" });
  };

  const makeLive = () => {
    if (!selectedNode) return;
    updateSelectedNode({ status: selectedIssues.length > 0 ? "incomplete" : "live" });
  };

  const publishWorkflow = () => {
    if (workflowIssues > 0) return;
    setPublishedVersion((version) => version + 1);
    setLastPublishedAt("Published just now");
    setMode("code");
  };

  const deleteSelected = () => {
    if (!selectedNode) return;
    const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
    setFlowNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setFlowEdges((current) =>
      current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
    );
    setSelectedNodeId(nextNodes[0]?.id ?? "");
  };

  const addIncomingEdge = () => {
    if (!selectedNode || connectFromId === selectedNode.id) return;
    const from = nodesById.get(connectFromId);
    if (!from) return;
    const compatibleKind = from.outputs.includes(connectKind)
      ? connectKind
      : from.outputs[0] ?? connectKind;
    const exists = edges.some(
      (edge) =>
        edge.from === from.id && edge.to === selectedNode.id && edge.kind === compatibleKind,
    );
    if (exists) return;
    setFlowEdges((current) => [
      ...current,
      createFlowEdge({ from: from.id, to: selectedNode.id, kind: compatibleKind }),
    ]);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = connection.source ? nodesById.get(connection.source) : undefined;
      const target = connection.target ? nodesById.get(connection.target) : undefined;
      if (!source || !target || source.id === target.id) return;
      const handleKind = connection.sourceHandle?.replace("out:", "") as PortKind | undefined;
      const kind =
        handleKind && source.outputs.includes(handleKind)
          ? handleKind
          : source.outputs.find((output) => target.inputs.includes(output)) ?? "json";

      setFlowEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `${source.id}-${target.id}-${kind}-${Date.now().toString(36)}`,
            type: "smoothstep",
            animated: false,
            data: { kind },
            style: { stroke: getPortColor(kind), strokeWidth: 1.4 },
          },
          current,
        ),
      );
    },
    [nodesById, setFlowEdges],
  );

  return (
    <div className="grid h-full min-w-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-shell">
      <aside className="flex min-w-0 flex-col border-r border-border bg-pane">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Agent graph
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-semibold">Node library</h2>
            <Button
              size="icon-sm"
              variant="outline"
              title="Create instruction node"
              onClick={() => addNode(libraryNodes[0])}
            >
              <Plus />
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {libraryMenus.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLibraryMenu(item.id)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                  libraryMenu === item.id && "bg-pane text-foreground shadow-sm",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-3">
            {(libraryMenu === "templates" || query.trim().length > 0) && (
            <section className="flex flex-col gap-1">
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Templates
              </p>
              {workflowTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => addTemplate(template)}
                  className="group flex w-full items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                    <Layers3 />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{template.label}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {template.description}
                    </span>
                  </span>
                </button>
              ))}
            </section>
            )}

            {["Core", "Tool", "Automation", "Safety", "Logic", "Data", "Output"].map((category) => {
              const categoryNodes = filteredLibrary.filter((node) => node.category === category);
              if (categoryNodes.length === 0) return null;

              return (
                <section key={category} className="flex flex-col gap-1">
                  <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {category}
                  </p>
                  {categoryNodes.map(({ id, title, description, icon: Icon, inputs, outputs }) => {
                    const template = libraryNodes.find((node) => node.id === id);
                    if (!template) return null;

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => addNode(template)}
                        className="group flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                          <Icon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="block truncate text-sm font-medium">{title}</span>
                            <CopyPlus className="text-muted-foreground" />
                          </span>
                          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {description}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1">
                            <Badge variant={riskTone[template.risk]} className="h-5 px-1.5 text-[10px]">
                              {template.risk}
                            </Badge>
                            {[...inputs, ...outputs].slice(0, 3).map((kind, index) => (
                              <span
                                key={`${kind}-${index}`}
                                className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                <span className={cn("size-1.5 rounded-full", portTone[kind])} />
                                {kind}
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <section className="flex min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-pane px-5 py-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Customer reply agent</h1>
            <p className="truncate text-xs text-muted-foreground">
              v{publishedVersion} - {nodes.length} nodes - {liveNodes} live - {workflowIssues} blocking issue
              {workflowIssues === 1 ? "" : "s"} - {draftIssues} draft issue
              {draftIssues === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {builderModes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                    mode === id && "bg-pane text-foreground shadow-sm",
                  )}
                >
                  <Icon />
                  {label}
                </button>
              ))}
            </div>
            <Badge variant={workflowIssues > 0 ? "destructive" : "secondary"}>
              {workflowIssues > 0 ? "Needs review" : lastPublishedAt}
            </Badge>
            <Button variant="outline" size="sm" onClick={validateSelected}>
              <ListChecks data-icon="inline-start" />
              Validate node
            </Button>
            <Button size="sm" disabled={workflowIssues > 0} onClick={publishWorkflow}>
              <Rocket data-icon="inline-start" />
              Publish
            </Button>
          </div>
        </div>

        {mode === "build" && (
          <div ref={flowPaneRef} className="relative min-h-0 min-w-0 flex-1 bg-shell">
            <ReactFlowProvider>
              <ReactFlow
                nodes={renderedFlowNodes}
                edges={[]}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => selectFlowNode(node.id)}
                onSelectionChange={({ nodes: selectedNodes }) => {
                  const nextSelected = selectedNodes[0]?.id;
                  if (nextSelected) setSelectedNodeId(nextSelected);
                }}
                onInit={setFlowInstance}
                fitView
                connectionRadius={32}
                defaultEdgeOptions={{ type: "smoothstep" }}
                className="bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[length:24px_24px]"
              >
                <FlowConnectionLines edges={flowEdges} nodes={renderedFlowNodes} />
                <Background gap={24} size={0.5} color="var(--border)" />
                <Controls
                  className="overflow-hidden rounded-md border border-border bg-pane shadow-sm"
                  showInteractive={false}
                />
                <MiniMap
                  className="overflow-hidden rounded-md border border-border bg-pane shadow-sm"
                  nodeColor={(node) =>
                    node.id === selectedNodeId ? "var(--active)" : "var(--muted)"
                  }
                  pannable
                  zoomable
                />
              </ReactFlow>
            </ReactFlowProvider>

            <div className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-md border border-border bg-pane px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <Sparkles />
              Drag, resize, and connect handles. Draft nodes may stay incomplete.
            </div>
            <div className="absolute right-5 top-5 flex items-center gap-2 rounded-md border border-border bg-pane p-2 shadow-sm">
              <Select
                value={quickNodeTemplateId}
                onValueChange={(value) => {
                  if (value) setQuickNodeTemplateId(value);
                }}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="Node type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {libraryNodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={addQuickNode}>
                <Plus data-icon="inline-start" />
                Add node
              </Button>
            </div>
            {selectedNode && (
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-pane p-2 shadow-sm">
                <span className="max-w-48 truncate px-2 text-sm font-medium">
                  {selectedNode.title || "Untitled node"}
                </span>
                <Badge variant={statusTone[selectedNode.status]}>{selectedNode.status}</Badge>
                <Button variant="outline" size="sm" onClick={keepDraft}>
                  <Save data-icon="inline-start" />
                  Draft
                </Button>
                <Button variant="outline" size="sm" onClick={validateSelected}>
                  <ListChecks data-icon="inline-start" />
                  Validate
                </Button>
                <Button size="sm" onClick={makeLive}>
                  <CheckCircle2 data-icon="inline-start" />
                  Live
                </Button>
                <Button variant="destructive" size="icon-sm" onClick={deleteSelected}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === "preview" && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] overflow-hidden bg-shell">
            <div className="flex min-w-0 flex-col gap-4 p-5">
              <section className="rounded-md border border-border bg-pane p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Preview run</p>
                    <p className="text-xs text-muted-foreground">
                      Test with live-like input and inspect each node event before publishing.
                    </p>
                  </div>
                  <Button size="sm" disabled={workflowIssues > 0}>
                    <Play data-icon="inline-start" />
                    Run preview
                  </Button>
                </div>
                <Textarea
                  value={sampleInput}
                  onChange={(event) => setSampleInput(event.target.value)}
                  className="mt-4"
                  rows={4}
                />
              </section>
              <section className="rounded-md border border-border bg-pane p-4">
                <p className="text-sm font-semibold">Trace</p>
                <div className="mt-3 flex flex-col divide-y divide-border rounded-md border border-border">
                  {runEvents.map((event) => (
                    <div key={event.label} className="flex items-center gap-3 px-3 py-3 text-sm">
                      {event.state === "complete" ? (
                        <CheckCircle2 className="text-success" />
                      ) : event.state === "running" ? (
                        <Clock3 className="text-active" />
                      ) : event.state === "waiting" ? (
                        <AlertTriangle className="text-fin" />
                      ) : (
                        <Circle className="text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{event.label}</span>
                      <Badge variant="outline">{event.state}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <aside className="border-l border-border bg-pane p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Data contract
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {nodes.slice(0, 6).map((node) => (
                  <div key={node.id} className="rounded-md border border-border p-3">
                    <p className="truncate text-sm font-medium">{node.title}</p>
                    <p className="mt-1 font-mono text-xs leading-5 text-muted-foreground">
                      {node.outputSchema}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}

        {mode === "evaluate" && (
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-auto bg-shell p-5">
            {[
              ["Safety grader", "Checks prompt injection, PII redaction, and tool-call approval."],
              ["Task success", "Scores whether the workflow selected the expected branch and response."],
              ["Trace review", "Annotates decisions, guardrail failures, and external calls."],
            ].map(([title, body]) => (
              <section key={title} className="rounded-md border border-border bg-pane p-4">
                <ClipboardCheck className="text-active" />
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{body}</p>
                <Button className="mt-4" variant="outline" size="sm">
                  <FlaskConical data-icon="inline-start" />
                  Configure grader
                </Button>
              </section>
            ))}
          </div>
        )}

        {mode === "code" && (
          <div className="min-h-0 flex-1 overflow-auto bg-shell p-5">
            <section className="rounded-md border border-border bg-pane">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Deployment snapshot</p>
                  <p className="text-xs text-muted-foreground">
                    Export a stable workflow contract for ChatKit-style embedding or an SDK runner.
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <Download data-icon="inline-start" />
                  Export
                </Button>
              </div>
              <pre className="overflow-auto p-4 text-xs leading-5 text-muted-foreground">
{JSON.stringify(
  {
    id: "customer_reply_agent",
    version: publishedVersion,
    provider: "ollama",
    nodes: nodes.map(({ id, templateId, title, status, outputSchema }) => ({
      id,
      type: templateId,
      title,
      status,
      outputSchema,
    })),
    edges,
  },
  null,
  2,
)}
              </pre>
            </section>
          </div>
        )}
      </section>

      <aside className="flex min-w-0 flex-col border-l border-border bg-pane">
        {selectedNode ? (
          <>
            <div className="border-b border-border px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inspector
              </p>
              <h2 className="mt-1 truncate text-base font-semibold">
                {selectedNode.title || "Untitled node"}
              </h2>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 p-4">
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Lifecycle
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant={riskTone[selectedNode.risk]}>{selectedNode.risk} risk</Badge>
                      <Badge variant={statusTone[selectedNode.status]}>
                        {selectedNode.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={keepDraft}>
                      <Save data-icon="inline-start" />
                      Keep draft
                    </Button>
                    <Button size="sm" onClick={makeLive}>
                      <CheckCircle2 data-icon="inline-start" />
                      Make live
                    </Button>
                  </div>
                </section>

                {selectedIssues.length > 0 && (
                  <>
                    <Separator />
                    <section className="flex flex-col gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Missing before live
                      </p>
                      {selectedIssues.map((issue) => (
                        <div key={issue} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="mt-0.5 text-destructive" />
                          <span className="leading-5 text-muted-foreground">{issue}</span>
                        </div>
                      ))}
                    </section>
                  </>
                )}

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Definition
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Name
                    <Input
                      value={selectedNode.title}
                      onChange={(event) => updateSelectedNode({ title: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Purpose
                    <Textarea
                      value={selectedNode.purpose}
                      onChange={(event) => updateSelectedNode({ purpose: event.target.value })}
                      rows={3}
                      placeholder="What this node is responsible for"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Operating instructions
                    <Textarea
                      value={selectedNode.instructions}
                      onChange={(event) =>
                        updateSelectedNode({ instructions: event.target.value })
                      }
                      rows={4}
                      placeholder="How the node should behave when it runs"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Output schema
                    <Textarea
                      value={selectedNode.outputSchema}
                      onChange={(event) =>
                        updateSelectedNode({ outputSchema: event.target.value })
                      }
                      rows={3}
                      placeholder="{ result: string, status: enum }"
                    />
                  </label>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Required configuration
                  </p>
                  {selectedNode.config.map((item) => (
                    <label key={item.label} className="flex flex-col gap-1.5 text-sm">
                      {item.label}
                      <Input
                        value={item.value}
                        onChange={(event) => updateConfigValue(item.label, event.target.value)}
                        placeholder={`Set ${item.label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Connect input
                  </p>
                  <Select
                    value={connectFromId}
                    onValueChange={(value) => setConnectFromId(value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Upstream node" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {nodes
                          .filter((node) => node.id !== selectedNode.id)
                          .map((node) => (
                            <SelectItem key={node.id} value={node.id}>
                              {node.title || "Untitled node"}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select
                    value={connectKind}
                    onValueChange={(value) => {
                      if (value) setConnectKind(value as PortKind);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Port type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(["text", "json", "tool", "policy", "memory"] as PortKind[]).map(
                          (kind) => (
                            <SelectItem key={kind} value={kind}>
                              {kind}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addIncomingEdge}>
                    <Plus data-icon="inline-start" />
                    Add connection
                  </Button>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ports
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-border p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Inputs</p>
                      <div className="flex flex-col gap-2">
                        {selectedNode.inputs.map((kind) => (
                          <div key={kind} className="flex items-center gap-2 text-sm">
                            <span className={cn("size-2 rounded-full", portTone[kind])} />
                            {kind}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Outputs</p>
                      <div className="flex flex-col gap-2">
                        {selectedNode.outputs.map((kind) => (
                          <div key={kind} className="flex items-center gap-2 text-sm">
                            <span className={cn("size-2 rounded-full", portTone[kind])} />
                            {kind}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Run queue
                  </p>
                  {runEvents.map((event) => (
                    <div key={event.label} className="flex items-center gap-3 text-sm">
                      {event.state === "complete" ? (
                        <CheckCircle2 className="text-success" />
                      ) : event.state === "running" ? (
                        <Clock3 className="text-active" />
                      ) : event.state === "waiting" ? (
                        <AlertTriangle className="text-fin" />
                      ) : (
                        <Circle className="text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{event.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
                    </div>
                  ))}
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Provider
                  </p>
                  <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-3">
                    <Bot className="text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">Ollama local</p>
                      <p className="truncate text-xs text-muted-foreground">
                        hermes-gemma4:e4b
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
                    <KeyRound className="mt-0.5 text-active" />
                    <p className="text-sm leading-5 text-muted-foreground">
                      External sends remain gated by human review even when local inference is enabled.
                    </p>
                  </div>
                </section>
              </div>
            </ScrollArea>

            <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-border p-3">
              <Button className="w-full" onClick={validateSelected}>
                <Settings2 data-icon="inline-start" />
                Validate selected
                <ChevronRight data-icon="inline-end" />
              </Button>
              <Button variant="destructive" size="icon" onClick={deleteSelected}>
                <Trash2 />
              </Button>
            </div>
          </>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Create or select a node.</div>
        )}
      </aside>
    </div>
  );
}
