import { useCallback } from "react";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ContextChipBadge } from "@/components/composer/context-chip";
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
  const { contextChips, removeContextChip, sessionId, projectId } =
    useSelectionStore();
  const addMessage = useDataStore((s) => s.addMessage);
  const { projects } = useDataStore();
  const setActiveView = useShellStore((s) => s.setActiveView);

  const project = projects.find((p) => p.id === projectId);

  const handleSend = useCallback(async () => {
    const text = composerText.trim();
    if (!text || !sessionId) return;

    setActiveView("chat");
    await addMessage(sessionId, text);
    resetComposer();
  }, [composerText, sessionId, addMessage, resetComposer, setActiveView]);

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
          <Textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What should we tackle?"
            rows={1}
            className={cn(
              "field-sizing-content max-h-32 min-h-0 resize-none rounded-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-sm shadow-none",
              "focus-visible:border-0 focus-visible:ring-0",
              "disabled:bg-transparent dark:bg-transparent",
            )}
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-1">
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                <Paperclip data-icon="inline-start" />
              </Button>
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
                Nexus · {composerMode === "plan" ? "Plan" : "Auto"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                <Mic data-icon="inline-start" />
              </Button>
              <Button
                size="icon-xs"
                onClick={() => void handleSend()}
                disabled={!composerText.trim() || !sessionId}
              >
                <ArrowUp data-icon="inline-start" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
