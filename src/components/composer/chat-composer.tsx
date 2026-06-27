import { useCallback, useRef, useState } from "react";
import { ArrowUp, CheckCircle2, FileText, PencilLine, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ContextChipBadge } from "@/components/composer/context-chip";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useDataStore } from "@/stores/data-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";
import type { ComposerMode } from "@/types";

const modes: ComposerMode[] = ["plan", "auto"];

export function ChatComposer() {
  const { composerText, composerMode, setComposerText, setComposerMode, resetComposer } =
    useChatStore();
  const { contextChips, removeContextChip, sessionId, projectId } = useSelectionStore();
  const { projects } = useDataStore();
  const {
    send,
    stop,
    status,
    pendingBriefPlan,
    artifactBusy,
    decidePendingBriefPlan,
  } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const setActiveView = useShellStore((s) => s.setActiveView);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);

  const project = projects.find((p) => p.id === projectId);
  const isBusy = status === "submitted" || status === "streaming" || artifactBusy;
  const [choiceBusy, setChoiceBusy] = useState<"create" | "dismiss" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = useCallback(async () => {
    const text = composerText.trim();
    if (!text || !sessionId) return;

    if (!connected) {
      await refreshStatus();
    }

    if (!useAuthStore.getState().status?.connected) {
      setSettingsOpen(true);
      return;
    }

    setActiveView("chat");
    resetComposer();
    await send(text);
  }, [
    composerText,
    connected,
    refreshStatus,
    resetComposer,
    send,
    sessionId,
    setActiveView,
    setSettingsOpen,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleCreatePlan = async () => {
    setChoiceBusy("create");
    try {
      await decidePendingBriefPlan("create");
    } finally {
      setChoiceBusy(null);
    }
  };

  const handleDismissPlan = async () => {
    setChoiceBusy("dismiss");
    try {
      await decidePendingBriefPlan("dismiss");
    } finally {
      setChoiceBusy(null);
    }
  };

  const handleRevisePlan = () => {
    setComposerText("Revise the brief plan to focus on ");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto w-full max-w-2xl">
        {(project || contextChips.length > 0) && (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 px-0.5">
            {project && (
              <Badge variant="outline" className="font-normal">
                {project.slug} · main
              </Badge>
            )}
            {contextChips.map((chip) => (
              <ContextChipBadge
                key={chip.id}
                chip={chip}
                onRemove={removeContextChip}
              />
            ))}
          </div>
        )}

        {pendingBriefPlan ? (
          <div className="mb-2 rounded-lg border border-border bg-pane p-3 shadow-pane">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-active-soft text-active">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Working Doc</p>
                      <Badge variant="secondary" className="font-normal">
                        v1 plan
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        Awaiting choice
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {pendingBriefPlan.title}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-normal">
                    Multiple choice
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  Dexter prepared the plan as a reviewable doc. Approve to produce the canvas artifact, revise the scope, or dismiss it.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Plan Overview", "Evidence", "HTML Canvas"].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Button
                    size="sm"
                    onClick={() => void handleCreatePlan()}
                    disabled={isBusy || choiceBusy !== null}
                    className="justify-start"
                  >
                    <CheckCircle2 data-icon="inline-start" />
                    {choiceBusy === "create" ? "Building..." : "Approve plan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRevisePlan}
                    disabled={isBusy || choiceBusy !== null}
                    className="justify-start"
                  >
                    <PencilLine data-icon="inline-start" />
                    Revise plan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDismissPlan()}
                    disabled={isBusy || choiceBusy !== null}
                    className="justify-start"
                  >
                    <X data-icon="inline-start" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-composer">
          {!connected && (
            <div className="border-b border-border px-3.5 py-2 text-xs text-muted-foreground">
              Add a Moonshot/Kimi key or configure Ollama on the server to start chatting.{" "}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setSettingsOpen(true)}
              >
                Open settings
              </button>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connected ? "What should we tackle?" : "Configure a chat provider to enable chat"
            }
            rows={1}
            disabled={isBusy}
            className={cn(
              "field-sizing-content max-h-32 min-h-0 resize-none rounded-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-sm shadow-none",
              "focus-visible:border-0 focus-visible:ring-0",
              "disabled:bg-transparent dark:bg-transparent",
            )}
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-1">
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[composerMode]}
                onValueChange={(value) => {
                  const next = value[0] as ComposerMode | undefined;
                  if (next) setComposerMode(next);
                }}
                className="rounded-md"
              >
                {modes.map((mode) => (
                  <ToggleGroupItem
                    key={mode}
                    value={mode}
                    className="h-7 min-w-0 px-2.5 text-xs capitalize"
                  >
                    {mode}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="hidden truncate pl-1 text-xs text-muted-foreground sm:inline">
                Nexus ·{" "}
                <span className={composerMode === "auto" ? "text-fin" : undefined}>
                  {isBusy ? "Running" : composerMode === "plan" ? "Plan" : "Auto"}
                </span>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              {isBusy ? (
                <Button variant="outline" size="icon-xs" onClick={stop}>
                  <Square data-icon="inline-start" />
                </Button>
              ) : (
                <Button
                  size="icon-xs"
                  onClick={() => void handleSend()}
                  disabled={!composerText.trim() || isBusy}
                >
                  <ArrowUp data-icon="inline-start" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
