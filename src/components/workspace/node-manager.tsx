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
import { useTheme } from "next-themes";
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
  Focus,
  FlaskConical,
  KeyRound,
  Layers3,
  ListChecks,
  MonitorPlay,
  Plus,
  Rocket,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
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
import {
  buildAgentBlueprint,
  createDraftNode,
  deploymentIconMap,
  deploymentTargets,
  domainPacks,
  initialEdges,
  initialNodes,
  libraryMenus,
  libraryNodes,
  nodePanels,
  packIconMap,
  runEvents,
  workflowTemplates,
} from "@/lib/agents/templates";
import type {
  AgentGraphNode,
  BuilderMode,
  DeploymentTarget,
  Edge,
  LibraryMenu,
  LibraryNode,
  NodePanel,
  NodeStatus,
  PortKind,
} from "@/lib/agents/types";
import { cn } from "@/lib/utils";

type GraphNode = AgentGraphNode;

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

const riskTone: Record<LibraryNode["risk"], "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

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
  if (!["start", "action-trigger", "note"].includes(node.templateId) && !hasIncoming) {
    issues.push("Connect this node to an upstream node before making it live.");
  }
  if (["start", "action-trigger"].includes(node.templateId) && hasIncoming) {
    issues.push("Trigger nodes cannot have upstream connections.");
  }
  if (!["output", "finish-handoff", "note"].includes(node.templateId) && !hasOutgoing) {
    issues.push("Connect this node to a downstream step before making it live.");
  }

  for (const item of node.config) {
    if (!item.value.trim()) issues.push(`Set ${item.label}.`);
  }

  if (node.templateId === "agent" || node.templateId === "orchestrator") {
    const schema = node.config.find((item) => item.label === "Output schema")?.value ?? "";
    if (node.templateId === "agent" && !schema.includes(",") && !schema.includes("{")) {
      issues.push("Agent nodes need a structured output schema, not only freeform text.");
    }
  }

  if (node.templateId === "orchestrator") {
    if (!node.delegationRule.trim()) {
      issues.push("Orchestrators need a delegation rule.");
    }
    if (node.orchestrationStrategy !== "manager-led") {
      issues.push("V1 orchestration must use the manager-led strategy.");
    }
  }

  if (node.agentRole === "specialist") {
    const domain = node.config.find((item) => item.label === "Domain description")?.value ?? "";
    const input = node.config.find((item) => item.label === "Input contract")?.value ?? "";
    const output = node.config.find((item) => item.label === "Output contract")?.value ?? "";
    const handoff = node.config.find((item) => item.label === "Handoff rule")?.value ?? node.handoffRule;
    if (!domain.trim()) issues.push("Specialist agents need a domain description.");
    if (!input.trim()) issues.push("Specialist agents need an input contract.");
    if (!output.trim()) issues.push("Specialist agents need an output contract.");
    if (!handoff.trim()) issues.push("Specialist agents need a handoff rule.");
  }

  if (node.templateId === "tool") {
    const approval = node.config.find((item) => item.label === "Approval")?.value ?? "";
    const approvedByNode = incomingEdges.some((edge) => {
      const upstream = nodes.find((candidate) => candidate.id === edge.from);
      return (
        upstream?.templateId === "approval" &&
        upstream.status !== "draft" &&
        upstream.status !== "incomplete"
      );
    });
    if (
      !approval.toLowerCase().includes("required") &&
      !approval.toLowerCase().includes("on") &&
      !approvedByNode
    ) {
      issues.push("Tool action nodes need explicit approval or a Human approval node before writes.");
    }
  }

  if (node.templateId === "guardrail") {
    const failurePath = node.config.find((item) => item.label === "Failure path")?.value ?? "";
    if (!failurePath.trim()) {
      issues.push("Guardrails need a failure path for blocked or redacted input.");
    }
  }

  if (node.templateId === "loop" || node.templateId === "work-loop") {
    const maxIterations =
      node.config.find((item) => item.label === "Max iterations")?.value ??
      String(node.iteration.maxIterations);
    if (!/\d/.test(maxIterations)) {
      issues.push("Iteration loop nodes need a numeric max iteration limit.");
    }
    const failurePath = node.config.find((item) => item.label === "Failure path")?.value ?? node.iteration.failurePath;
    if (!failurePath.trim()) {
      issues.push("Work loops need a failure path.");
    }
  }

  if (node.risk === "high" && node.dataAccess.classification !== "restricted") {
    issues.push("High-risk nodes need a restricted data access policy.");
  }

  if (node.templateId === "evaluation" || node.templateId === "success-evaluator") {
    const passingScore = node.config.find((item) => item.label === "Passing score")?.value ?? "";
    if (!/\d/.test(passingScore)) {
      issues.push("Evaluation nodes need a numeric passing score.");
    }
  }

  if (node.templateId === "finish-handoff") {
    const successOutput = node.config.find((item) => item.label === "Success output")?.value ?? "";
    const fallbackOutput = node.config.find((item) => item.label === "Fallback output")?.value ?? "";
    if (!successOutput.trim()) issues.push("Finish nodes need a success output.");
    if (!fallbackOutput.trim()) issues.push("Finish nodes need a fallback output.");
  }

  if (node.templateId === "audit") {
    const retention = node.config.find((item) => item.label === "Retention")?.value ?? "";
    if (!retention.trim()) {
      issues.push("Audit nodes need a retention policy.");
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
    ai: node.category === "Agent" ? "Reason over sanctioned work context" : "Shape this step with AI",
    action: node.category === "Tool" ? "Run an approved enterprise action" : "Prepare automation output",
    time: node.templateId === "loop" ? "Loop with a strict limit" : "Schedule, wait, or resume",
    review: ["Guardrail", "Approval", "Evaluation", "Audit"].includes(node.category)
      ? "Enforce policy, review, evals, or evidence"
      : "Require review when needed",
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

const fitViewOptions = {
  padding: 0.18,
  maxZoom: 0.85,
  duration: 240,
};

export function NodeManager() {
  const { resolvedTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<BuilderMode>("build");
  const [libraryMenu, setLibraryMenu] = useState<LibraryMenu>("templates");
  const [quickNodeTemplateId, setQuickNodeTemplateId] = useState("agent");
  const [domainPackId, setDomainPackId] = useState("basic-workforce");
  const deploymentTargetIds = useMemo(
    () => deploymentTargets.filter((target) => target.id !== "customer-channel").map((target) => target.id),
    [],
  );
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
    "A prompt and invoice packet ask the system to inspect the requested action, decide whether Accounts, Support, or Tax should work on it, loop until the output is complete, then finish or escalate.",
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
  const customerDeploymentIssues = useMemo(() => {
    const readyTemplates = new Set(
      nodes
        .filter((node) => node.status !== "draft" && node.status !== "incomplete")
        .map((node) => node.templateId),
    );
    const missingControls = [
      ["guardrail", "privacy guardrail"],
      ["approval", "human approval"],
      ["audit", "audit trail"],
      ["evaluation", "evaluation suite"],
    ].flatMap(([templateId, label]) => (readyTemplates.has(templateId) ? [] : [label]));

    return missingControls.map((label) => `Customer-facing channel requires ${label}.`);
  }, [nodes]);
  const graphIssues = useMemo(() => {
    const orchestrators = nodes.filter((node) => node.templateId === "orchestrator");
    const finishers = nodes.filter((node) => node.templateId === "finish-handoff");
    const specialists = nodes.filter((node) => node.agentRole === "specialist");

    return [
      ...(orchestrators.length === 1
        ? []
        : [`Multi-agent graphs need exactly one Orchestrator. Found ${orchestrators.length}.`]),
      ...(finishers.length > 0 ? [] : ["Multi-agent graphs need a Finish / handoff node."]),
      ...(specialists.length > 0 ? [] : ["Multi-agent graphs need at least one Specialist agent."]),
    ];
  }, [nodes]);
  const workflowIssues =
    nodes.flatMap((node) => nodeIssuesById.get(node.id) ?? []).length +
    graphIssues.length;
  const draftIssues = nodes
    .filter((node) => node.status === "draft")
    .flatMap((node) => nodeIssuesById.get(node.id) ?? []).length;
  const liveNodes = nodes.filter((node) => node.status === "live").length;
  const activePack = domainPacks.find((pack) => pack.id === domainPackId) ?? domainPacks[0];
  const activeBlueprint = useMemo(
    () =>
      buildAgentBlueprint({
        nodes,
        edges,
        version: publishedVersion,
        status: workflowIssues > 0 ? "draft" : "ready",
        domainPackId,
        deploymentTargetIds,
      }),
    [deploymentTargetIds, domainPackId, edges, nodes, publishedVersion, workflowIssues],
  );

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

  const renderedFlowNodes = useMemo<AgentFlowNode[]>(
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

  const updateDataAccessValue = (
    key: keyof GraphNode["dataAccess"],
    value: GraphNode["dataAccess"][typeof key],
  ) => {
    if (!selectedNode) return;
    updateSelectedNode({
      dataAccess: { ...selectedNode.dataAccess, [key]: value },
    });
  };

  const updateApprovalValue = (
    key: keyof GraphNode["approval"],
    value: GraphNode["approval"][typeof key],
  ) => {
    if (!selectedNode) return;
    updateSelectedNode({
      approval: { ...selectedNode.approval, [key]: value },
    });
  };

  const updateEvaluationCriteria = (value: string) => {
    if (!selectedNode) return;
    updateSelectedNode({
      evaluation: {
        ...selectedNode.evaluation,
        criteria: value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
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
    setDomainPackId(template.domainPackId);
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

  const addDomainPack = (packId: string) => {
    const pack = domainPacks.find((candidate) => candidate.id === packId);
    if (!pack) return;
    setDomainPackId(pack.id);
    const packTemplate = {
      label: pack.label,
      description: pack.description,
      domainPackId: pack.id,
      icon: packIconMap[pack.id as keyof typeof packIconMap] ?? Layers3,
      nodeIds: pack.defaultNodeIds,
    };
    addTemplate(packTemplate);
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

  const fitGraph = useCallback(() => {
    flowInstance?.fitView(fitViewOptions);
  }, [flowInstance]);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-shell">
      <aside className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-pane">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Agent blueprint
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-semibold">Builder catalog</h2>
            <Button
              size="icon-sm"
              variant="outline"
              title="Create work intake node"
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
              placeholder="Search agent blocks"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
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
                Process templates
              </p>
              {workflowTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => addTemplate(template)}
                  className="group flex w-full items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-muted"
                >
                  {(() => {
                    const Icon = template.icon;
                    return (
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                        <Icon />
                  </span>
                    );
                  })()}
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

            {(libraryMenu === "packs" || query.trim().length > 0) && (
              <section className="flex flex-col gap-1">
                <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Domain packs
                </p>
                {domainPacks.map((pack) => {
                  const Icon = packIconMap[pack.id as keyof typeof packIconMap];

                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => addDomainPack(pack.id)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted",
                        pack.id === domainPackId
                          ? "border-active bg-active-soft"
                          : "border-border bg-background",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                        <Icon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="block truncate text-sm font-medium">{pack.label}</span>
                          <Badge variant={riskTone[pack.riskTier]} className="h-5 px-1.5 text-[10px]">
                            {pack.riskTier}
                          </Badge>
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {pack.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            )}

            {[
              "Input",
              "Agent",
              "Specialist",
              "Orchestration",
              "Knowledge",
              "Tool",
              "Logic",
              "Automation",
              "Guardrail",
              "Approval",
              "Evaluation",
              "Audit",
              "Data",
              "Memory",
              "Output",
            ].map((category) => {
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

      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-pane px-5 py-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Workforce agent builder</h1>
            <p className="truncate text-xs text-muted-foreground">
              {activePack.label} - v{publishedVersion} - {nodes.length} nodes - {liveNodes} live - {workflowIssues} blocking issue
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
          <div ref={flowPaneRef} className="relative h-full min-h-0 min-w-0 flex-1 bg-shell">
            <ReactFlowProvider>
              <ReactFlow
                colorMode={resolvedTheme === "light" ? "light" : "dark"}
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
                onInit={(instance) => {
                  setFlowInstance(instance);
                  window.requestAnimationFrame(() => {
                    instance.fitView(fitViewOptions);
                  });
                }}
                fitView
                fitViewOptions={fitViewOptions}
                minZoom={0.25}
                maxZoom={1.1}
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
              Draft agents stay safe until blueprint checks pass.
            </div>
            <div className="absolute right-5 top-5 flex items-center gap-2 rounded-md border border-border bg-pane p-2 shadow-sm">
              <Button variant="outline" size="sm" onClick={fitGraph}>
                <Focus data-icon="inline-start" />
                Fit graph
              </Button>
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
                      Test with employee-style input and inspect policy, approval, and audit events.
                    </p>
                  </div>
                  <Button size="sm" disabled={workflowIssues > 0}>
                    <MonitorPlay data-icon="inline-start" />
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
                Blueprint contract
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
              <Separator className="my-4" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Deployment targets
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {deploymentTargets.map((target) => {
                  const Icon = deploymentIconMap[target.id];
                  const locked =
                    target.id === "customer-channel" && customerDeploymentIssues.length > 0;

                  return (
                    <div key={target.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {target.label}
                        </span>
                        <Badge variant={locked ? "destructive" : "secondary"}>
                          {locked ? "locked" : "ready"}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {target.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {mode === "evaluate" && (
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-auto bg-shell p-5">
            {[
              ["Workforce baseline", "Scores task success, grounded answers, and follow-up accuracy."],
              ["Governance gate", "Checks approvals, restricted data boundaries, and tool-call review."],
              ["Customer readiness", "Locks customer deployment until privacy, audit, and eval checks pass."],
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
                    Export the shared AgentBlueprint contract used by canvas and chat-created drafts.
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <Download data-icon="inline-start" />
                  Export
                </Button>
              </div>
              <pre className="overflow-auto p-4 text-xs leading-5 text-muted-foreground">
{JSON.stringify(
  activeBlueprint,
  null,
  2,
)}
              </pre>
            </section>
          </div>
        )}
      </section>

      <aside className="flex h-full min-h-0 min-w-0 flex-col border-l border-border bg-pane">
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

                {graphIssues.length > 0 && (
                  <>
                    <Separator />
                    <section className="flex flex-col gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Blueprint blockers
                      </p>
                      {graphIssues.map((issue) => (
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
                    Identity and purpose
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
                    Orchestration
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Agent role
                    <Select
                      value={selectedNode.agentRole}
                      onValueChange={(value) =>
                        updateSelectedNode({
                          agentRole: value as GraphNode["agentRole"],
                          orchestrationStrategy:
                            value === "orchestrator" ? "manager-led" : selectedNode.orchestrationStrategy,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Agent role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["orchestrator", "inspector", "specialist", "reviewer", "finisher"].map(
                            (role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ),
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Delegation rule
                    <Textarea
                      value={selectedNode.delegationRule}
                      onChange={(event) =>
                        updateSelectedNode({ delegationRule: event.target.value })
                      }
                      rows={3}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Max iterations
                    <Input
                      value={String(selectedNode.iteration.maxIterations)}
                      onChange={(event) =>
                        updateSelectedNode({
                          iteration: {
                            ...selectedNode.iteration,
                            maxIterations: Number(event.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Success criteria
                    <Textarea
                      value={selectedNode.iteration.successCriteria}
                      onChange={(event) =>
                        updateSelectedNode({
                          iteration: {
                            ...selectedNode.iteration,
                            successCriteria: event.target.value,
                          },
                        })
                      }
                      rows={3}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Handoff / escalation rule
                    <Textarea
                      value={selectedNode.handoffRule}
                      onChange={(event) => updateSelectedNode({ handoffRule: event.target.value })}
                      rows={3}
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
                    Knowledge and data access
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Classification
                    <Select
                      value={selectedNode.dataAccess.classification}
                      onValueChange={(value) =>
                        updateDataAccessValue(
                          "classification",
                          value as GraphNode["dataAccess"]["classification"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Classification" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["public", "internal", "confidential", "restricted"].map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Sources
                    <Input
                      value={selectedNode.dataAccess.sources}
                      onChange={(event) => updateDataAccessValue("sources", event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Retention
                    <Input
                      value={selectedNode.dataAccess.retention}
                      onChange={(event) => updateDataAccessValue("retention", event.target.value)}
                    />
                  </label>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Approval policy
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Mode
                    <Select
                      value={selectedNode.approval.mode}
                      onValueChange={(value) =>
                        updateApprovalValue(
                          "mode",
                          value as GraphNode["approval"]["mode"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Approval mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {["none", "human-review", "manager-review", "compliance-review"].map(
                            (modeOption) => (
                              <SelectItem key={modeOption} value={modeOption}>
                                {modeOption}
                              </SelectItem>
                            ),
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Approver
                    <Input
                      value={selectedNode.approval.approver}
                      onChange={(event) => updateApprovalValue("approver", event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Required for
                    <Input
                      value={selectedNode.approval.requiredFor}
                      onChange={(event) => updateApprovalValue("requiredFor", event.target.value)}
                    />
                  </label>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Evals and audit
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Evaluation suite
                    <Input
                      value={selectedNode.evaluation.suite}
                      onChange={(event) =>
                        updateSelectedNode({
                          evaluation: {
                            ...selectedNode.evaluation,
                            suite: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Criteria
                    <Textarea
                      value={selectedNode.evaluation.criteria.join(", ")}
                      onChange={(event) => updateEvaluationCriteria(event.target.value)}
                      rows={3}
                    />
                  </label>
                </section>

                <Separator />

                <section className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Deployment target
                  </p>
                  {deploymentTargets.map((target: DeploymentTarget) => {
                    const Icon = deploymentIconMap[target.id];
                    const locked =
                      target.id === "customer-channel" && customerDeploymentIssues.length > 0;

                    return (
                      <div key={target.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {target.label}
                          </span>
                          <Badge variant={locked ? "destructive" : "outline"}>
                            {locked ? "locked" : "available"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {target.requiredControls.join(", ")}
                        </p>
                      </div>
                    );
                  })}
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
                      <p className="truncate text-sm font-medium">Moonshot/Kimi</p>
                      <p className="truncate text-xs text-muted-foreground">
                        kimi-k2.7-code
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
                    <KeyRound className="mt-0.5 text-active" />
                    <p className="text-sm leading-5 text-muted-foreground">
                      External sends remain gated by human review while Kimi handles model inference.
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
