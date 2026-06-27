import { useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Database,
  FileText,
  KeyRound,
  MessageSquare,
  Pin,
  PinOff,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { agentBrainStageLabels, agentSkillDefinitions } from "@/lib/agents/brain";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { AgentBrainRunStatus, PermissionGrant } from "@/types";

const statusTone: Record<AgentBrainRunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-50 text-blue-700 border-blue-100",
  needs_approval: "bg-amber-50 text-amber-700 border-amber-100",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  failed: "bg-red-50 text-red-700 border-red-100",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function grantLabel(grant: PermissionGrant) {
  if (grant.status === "granted") return "Granted";
  if (grant.status === "revoked") return "Revoked";
  if (grant.status === "requires_approval") return "Approval";
  return "Available";
}

export function AgentBrainPanel() {
  const { projectId } = useSelectionStore();
  const {
    projects,
    workRuns,
    agentBrainRuns,
    agentBrainSteps,
    agentBrainToolCalls,
    agentObservations,
    agentApprovals,
    agentContextPacks,
    agentMemories,
    permissionGrants,
    gatewayMessages,
    createGatewayMessage,
    routeGatewayMessage,
    startAgentBrainRun,
    updateAgentMemory,
    deleteAgentMemory,
    updatePermissionGrant,
  } = useDataStore();
  const activeProjectId = projectId ?? projects[0]?.id ?? "proj-1";
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [gatewayText, setGatewayText] = useState("Customer support lead says the onboarding response flow needs a status brief.");

  const runs = useMemo(
    () =>
      agentBrainRuns
        .filter((run) => run.projectId === activeProjectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [activeProjectId, agentBrainRuns],
  );
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const selectedSteps = selectedRun
    ? agentBrainSteps
        .filter((step) => step.runId === selectedRun.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];
  const selectedTools = selectedRun
    ? agentBrainToolCalls.filter((tool) => tool.runId === selectedRun.id)
    : [];
  const selectedObservations = selectedRun
    ? agentObservations.filter((observation) => observation.runId === selectedRun.id)
    : [];
  const selectedContext = selectedRun
    ? agentContextPacks.find((context) => context.id === selectedRun.contextPackId)
    : undefined;
  const memories = agentMemories
    .filter((memory) => memory.projectId === activeProjectId)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
  const grants = permissionGrants.filter((grant) => grant.projectId === activeProjectId);
  const approvals = agentApprovals
    .filter((approval) => approval.projectId === activeProjectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const gateway = gatewayMessages
    .filter((message) => message.projectId === activeProjectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const artifacts = workRuns
    .filter((run) => run.projectId === activeProjectId)
    .slice(0, 4);

  const simulateGateway = () => {
    if (!gatewayText.trim()) return;
    const message = createGatewayMessage({
      projectId: activeProjectId,
      channel: "webhook",
      sender: "Webhook simulator",
      text: gatewayText.trim(),
    });
    const run = startAgentBrainRun({
      projectId: activeProjectId,
      gatewayMessageId: message.id,
      request: message.text,
      title: "Webhook gateway run",
      intent: "gateway_notification",
      outputKind: "gateway_notification",
    });
    routeGatewayMessage(message.id, run.id);
    setSelectedRunId(run.id);
    setGatewayText("");
  };

  return (
    <Tabs defaultValue="activity" className="flex h-full flex-col">
      <div className="border-b border-border px-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Agent Brain</p>
            <p className="truncate text-xs text-muted-foreground">
              Runs, memory, trust, gateway
            </p>
          </div>
        </div>
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="trust">Trust</TabsTrigger>
          <TabsTrigger value="gateway">Gateway</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="activity" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-5 p-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Agent Activity
                </p>
                <Badge variant="outline">{runs.length}</Badge>
              </div>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Send a message to create the first durable agent run.
                </p>
              ) : (
                <div className="space-y-1">
                  {runs.slice(0, 6).map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setSelectedRunId(run.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted",
                        selectedRun?.id === run.id && "bg-active-soft",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{run.title}</span>
                        <Badge variant="outline" className={statusTone[run.status]}>
                          {statusLabel(run.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {run.request}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedRun ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Run Timeline
                  </p>
                </div>
                <div className="space-y-3">
                  {selectedSteps.map((step) => (
                    <div key={step.id} className="border-l border-border pl-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{step.title}</p>
                        <span className="text-[11px] text-muted-foreground">
                          {formatTime(step.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {agentBrainStageLabels[step.stage]}: {step.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Working Doc
                </p>
              </div>
              {selectedContext ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Context pack</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {selectedContext.summary}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No run context selected.</p>
              )}
              {selectedTools.length > 0 ? (
                <div className="space-y-2">
                  {selectedTools.map((tool) => (
                    <div key={tool.id} className="rounded-md border border-border p-2">
                      <p className="text-sm font-medium">{tool.toolName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tool.outputSummary ?? tool.inputSummary}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedObservations.length > 0 ? (
                <div className="space-y-2">
                  {selectedObservations.map((observation) => (
                    <div key={observation.id} className="rounded-md border border-border p-2">
                      <p className="text-sm font-medium">{observation.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{observation.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Artifact Dock
                </p>
              </div>
              {artifacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No brief artifacts yet.</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((run) => {
                    const latestDraft = run.drafts[run.drafts.length - 1];
                    return (
                      <div key={run.id} className="rounded-md border border-border p-2">
                        <p className="line-clamp-1 text-sm font-medium">{run.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestDraft?.htmlArtifact?.fileName ?? "Draft artifact"} | {run.audit.score}/100 audit
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="memory" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 p-4">
            {memories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask Nexus to remember a preference or project fact.
              </p>
            ) : (
              memories.map((memory) => (
                <div key={memory.id} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{memory.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {memory.kind} | confidence {Math.round(memory.confidence * 100)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => updateAgentMemory(memory.id, { pinned: !memory.pinned })}
                      >
                        {memory.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => deleteAgentMemory(memory.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    defaultValue={memory.body}
                    className="min-h-20 resize-none text-xs"
                    onBlur={(event) =>
                      updateAgentMemory(memory.id, { body: event.currentTarget.value })
                    }
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="trust" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-5 p-4">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Permission Center
                </p>
              </div>
              {approvals.length > 0 ? (
                <div className="space-y-2">
                  {approvals.slice(0, 3).map((approval) => (
                    <div key={approval.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{approval.action}</p>
                        <Badge variant="outline">{statusLabel(approval.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {grants.map((grant) => (
                <div key={grant.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{grant.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{grant.reason}</p>
                    </div>
                    <Badge variant="outline">{grantLabel(grant)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Trust L{grant.trustLevel} | {grant.risk} risk
                    </p>
                    <div className="flex items-center gap-1">
                      {grant.risk !== "high" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updatePermissionGrant(grant.id, "granted")}
                        >
                          Grant
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updatePermissionGrant(grant.id, "requires_approval")}
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Skills Registry
                </p>
              </div>
              {agentSkillDefinitions.map((skill) => (
                <div key={skill.id} className="rounded-md border border-border p-2">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{skill.description}</p>
                </div>
              ))}
            </section>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="gateway" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Webhook className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Gateway Simulator
                </p>
              </div>
              <Input value="Webhook" readOnly className="h-8 text-xs" />
              <Textarea
                value={gatewayText}
                onChange={(event) => setGatewayText(event.target.value)}
                className="min-h-24 resize-none text-xs"
              />
              <Button size="sm" className="w-full" onClick={simulateGateway}>
                <Send className="size-3.5" />
                Route message
              </Button>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Routed Messages
                </p>
              </div>
              {gateway.length === 0 ? (
                <p className="text-sm text-muted-foreground">No gateway messages yet.</p>
              ) : (
                gateway.map((message) => (
                  <div key={message.id} className="rounded-md border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{message.sender}</p>
                      <Badge variant="outline">{message.channel}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {message.text}
                    </p>
                  </div>
                ))
              )}
            </section>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
