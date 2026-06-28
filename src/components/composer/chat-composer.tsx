import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, CheckCircle2, FileText, ImageIcon, ListTodo, Mail, Paperclip, PencilLine, Square, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { ContextChipBadge } from "@/components/composer/context-chip";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import { fileToAttachment, composeMessageWithAttachments, formatBytes } from "@/lib/chat/attachments";
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
  const attachments = useChatStore((s) => s.attachments);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const { contextChips, removeContextChip, sessionId, projectId, setSessionId } =
    useSelectionStore();
  const { projects } = useDataStore();
  const addSession = useDataStore((s) => s.addSession);
  const {
    send,
    composeEmail,
    proposeTasks,
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
  const [pending, setPending] = useState<{ kind: "send" | "email" | "tasks"; text: string } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      for (const file of list) {
        const attachment = await fileToAttachment(file);
        addAttachment(attachment);
      }
    },
    [addAttachment],
  );

  const handleSend = useCallback(async () => {
    const text = composerText.trim();
    const current = useChatStore.getState().attachments;
    if (!text && current.length === 0) return;

    if (!connected) {
      await refreshStatus();
    }

    if (!useAuthStore.getState().status?.connected) {
      setSettingsOpen(true);
      return;
    }

    setActiveView("chat");

    const outgoing = composeMessageWithAttachments(text, current);

    // No active session yet (e.g. the empty state): create one in the current
    // project, then send once the new session is live (handled by the effect).
    if (!sessionId) {
      if (!projectId) {
        toast.error("Select a project to start chatting.");
        return;
      }
      resetComposer();
      const session = await addSession(projectId);
      setSessionId(session.id);
      setPending({ kind: "send", text: outgoing });
      return;
    }

    resetComposer();
    await send(outgoing);
  }, [
    addSession,
    composerText,
    connected,
    projectId,
    refreshStatus,
    resetComposer,
    send,
    sessionId,
    setActiveView,
    setSessionId,
    setSettingsOpen,
  ]);

  const handleEmail = useCallback(async () => {
    const text = composerText.trim();
    if (!text) {
      toast.message("Type what the email should say first.");
      return;
    }
    if (!connected) await refreshStatus();
    if (!useAuthStore.getState().status?.connected) {
      setSettingsOpen(true);
      return;
    }
    setActiveView("chat");

    if (!sessionId) {
      if (!projectId) {
        toast.error("Select a project to start chatting.");
        return;
      }
      resetComposer();
      const session = await addSession(projectId);
      setSessionId(session.id);
      setPending({ kind: "email", text });
      return;
    }

    resetComposer();
    await composeEmail(text);
  }, [
    addSession,
    composeEmail,
    composerText,
    connected,
    projectId,
    refreshStatus,
    resetComposer,
    sessionId,
    setActiveView,
    setSessionId,
    setSettingsOpen,
  ]);

  const handleTasks = useCallback(async () => {
    const text = composerText.trim();
    if (!text) {
      toast.message("Describe the work and I'll break it into tasks.");
      return;
    }
    if (!connected) await refreshStatus();
    if (!useAuthStore.getState().status?.connected) {
      setSettingsOpen(true);
      return;
    }
    setActiveView("chat");

    if (!sessionId) {
      if (!projectId) {
        toast.error("Select a project to start chatting.");
        return;
      }
      resetComposer();
      const session = await addSession(projectId);
      setSessionId(session.id);
      setPending({ kind: "tasks", text });
      return;
    }

    resetComposer();
    await proposeTasks(text);
  }, [
    addSession,
    composerText,
    connected,
    projectId,
    proposeTasks,
    refreshStatus,
    resetComposer,
    sessionId,
    setActiveView,
    setSessionId,
    setSettingsOpen,
  ]);

  // Flush a queued action once the freshly created session becomes active.
  // Defer so the session provider settles the new (empty) session before we
  // persist + send — otherwise the provider reloads the just-persisted message
  // and chat.sendMessage appends it again, rendering the first message twice.
  useEffect(() => {
    if (!pending || !sessionId) return;
    const queued = pending;
    setPending(null);
    window.setTimeout(() => {
      if (queued.kind === "email") void composeEmail(queued.text);
      else if (queued.kind === "tasks") void proposeTasks(queued.text);
      else void send(queued.text);
    }, 0);
  }, [pending, sessionId, send, composeEmail, proposeTasks]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  const handleDragLeave = () => {
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    void ingestFiles(e.dataTransfer.files);
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

        <div
          className="group relative rounded-[1.4rem] border border-border bg-composer shadow-[0_18px_50px_-28px_oklch(0_0_0/0.85)] transition-all duration-200 focus-within:border-foreground/20 focus-within:shadow-[0_22px_60px_-26px_oklch(0_0_0/0.95)]"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[1.4rem] border-2 border-dashed border-primary/50 bg-background/85 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground motion-safe:animate-pulse">
                <Upload className="size-4" />
                Drop files to attach
              </div>
            </div>
          )}

          {!connected && (
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
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

          {attachments.length > 0 && (
            <AttachmentGroup className="px-3 pt-3">
              {attachments.map((attachment) => (
                <Attachment key={attachment.id} size="sm">
                  <AttachmentMedia variant={attachment.kind === "image" ? "image" : "icon"}>
                    {attachment.kind === "image" && attachment.previewUrl ? (
                      <img src={attachment.previewUrl} alt={attachment.name} />
                    ) : attachment.kind === "image" ? (
                      <ImageIcon />
                    ) : (
                      <FileText />
                    )}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{attachment.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {attachment.kind === "text" ? "Text · " : attachment.kind === "image" ? "Image · " : ""}
                      {formatBytes(attachment.size)}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <X />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              ))}
            </AttachmentGroup>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void ingestFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <Textarea
            ref={textareaRef}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              connected ? "What should we tackle?" : "Configure a chat provider to enable chat"
            }
            rows={1}
            disabled={isBusy}
            className={cn(
              "field-sizing-content max-h-40 min-h-0 resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/70",
              "focus-visible:border-0 focus-visible:ring-0",
              "disabled:bg-transparent dark:bg-transparent",
            )}
          />

          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                aria-label="Attach files"
                title="Attach files"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                aria-label="Draft email"
                title="Draft an email from this"
                disabled={isBusy}
                onClick={() => void handleEmail()}
              >
                <Mail />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                aria-label="Propose tasks"
                title="Break this into tasks for the board"
                disabled={isBusy}
                onClick={() => void handleTasks()}
              >
                <ListTodo />
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
                className="rounded-full"
              >
                {modes.map((mode) => (
                  <ToggleGroupItem
                    key={mode}
                    value={mode}
                    className="h-7 min-w-0 rounded-full px-3 text-xs capitalize"
                  >
                    {mode}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                Nexus ·{" "}
                <span className={composerMode === "auto" ? "text-fin" : undefined}>
                  {isBusy ? "Running" : composerMode === "plan" ? "Plan" : "Auto"}
                </span>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              {isBusy ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={stop}
                  className="rounded-full"
                  aria-label="Stop generating"
                >
                  <Square data-icon="inline-start" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => void handleSend()}
                  disabled={(!composerText.trim() && attachments.length === 0) || isBusy}
                  className="rounded-full transition-transform hover:scale-105 active:scale-95"
                  aria-label="Send message"
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
