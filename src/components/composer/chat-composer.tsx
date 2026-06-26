import { useCallback } from "react";
import { ArrowUp, Square } from "lucide-react";
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
  const { send, stop, status } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const setActiveView = useShellStore((s) => s.setActiveView);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);

  const project = projects.find((p) => p.id === projectId);
  const isBusy = status === "submitted" || status === "streaming";

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
