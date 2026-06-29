import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hammer,
  ImageIcon,
  ListTodo,
  Mail,
  Paperclip,
  PencilLine,
  Plus,
  Square,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ComposerStatus } from "@/components/composer/composer-status";
import {
  ComposerSlashMenu,
  type SlashCommand,
} from "@/components/composer/composer-slash-menu";
import { PlanIntakeCard } from "@/components/composer/plan-intake-card";
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

const slashCommands: SlashCommand[] = [
  { id: "plan", label: "Plan mode", hint: "Ask questions, then draft a plan", keyword: "plan", icon: ClipboardList },
  { id: "auto", label: "Auto mode", hint: "Act directly without planning", keyword: "auto", icon: Zap },
  { id: "generate", label: "Generate plan", hint: "Draft the plan from this chat", keyword: "generate plan", icon: Hammer },
  { id: "email", label: "Draft email", hint: "Write an email — /email <what to say>", keyword: "email", icon: Mail },
  { id: "tasks", label: "Propose tasks", hint: "Break work into tasks — /tasks <work>", keyword: "tasks", icon: ListTodo },
  { id: "attach", label: "Attach files", hint: "Add files for context", keyword: "attach files", icon: Paperclip },
];

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
    activities,
    pendingBriefPlan,
    planIntake,
    planBusy,
    generatePlan,
    artifactBusy,
    decidePendingBriefPlan,
  } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const setActiveView = useShellStore((s) => s.setActiveView);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);

  const project = projects.find((p) => p.id === projectId);
  const isBusy = status === "submitted" || status === "streaming" || artifactBusy || planBusy;
  const [choiceBusy, setChoiceBusy] = useState<"create" | "dismiss" | null>(null);
  const [pending, setPending] = useState<{ kind: "send" | "email" | "tasks"; text: string } | null>(
    null,
  );
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusAfterRunRef = useRef(false);
  const queueDispatchingRef = useRef(false);

  const focusComposer = useCallback(() => {
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea || textarea.disabled) return;
      textarea.focus();
      const caret = textarea.value.length;
      textarea.setSelectionRange(caret, caret);
    }, 0);
  }, []);

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

  const ensureConnected = useCallback(async () => {
    if (!connected) await refreshStatus();
    if (!useAuthStore.getState().status?.connected) {
      setSettingsOpen(true);
      return false;
    }
    return true;
  }, [connected, refreshStatus, setSettingsOpen]);

  const handleSend = useCallback(
    async (override?: string) => {
      const text = (override ?? composerText).trim();
      const current = useChatStore.getState().attachments;
      if (!text && current.length === 0) return;
      if (!(await ensureConnected())) return;

      setActiveView("chat");
      restoreFocusAfterRunRef.current = true;
      const outgoing = composeMessageWithAttachments(text, current);

      // No active session yet (e.g. the empty state): create one, then send once
      // the new session is live (handled by the pending-flush effect).
      if (!sessionId) {
        if (!projectId) {
          toast.error("Select a project to start chatting.");
          return;
        }
        resetComposer();
        const session = await addSession(projectId);
        setSessionId(session.id);
        setPending({ kind: "send", text: outgoing });
        focusComposer();
        return;
      }

      resetComposer();
      focusComposer();
      if (isBusy) {
        setQueuedMessages((currentQueue) => [...currentQueue, outgoing]);
        return;
      }
      await send(outgoing);
    },
    [
      addSession,
      composerText,
      ensureConnected,
      focusComposer,
      isBusy,
      projectId,
      resetComposer,
      send,
      sessionId,
      setActiveView,
      setSessionId,
    ],
  );

  const handleEmail = useCallback(
    async (override?: string) => {
      const text = (override ?? composerText).trim();
      if (!text) {
        toast.message("Type what the email should say first.");
        return;
      }
      if (!(await ensureConnected())) return;
      setActiveView("chat");
      restoreFocusAfterRunRef.current = true;

      if (!sessionId) {
        if (!projectId) {
          toast.error("Select a project to start chatting.");
          return;
        }
        resetComposer();
        const session = await addSession(projectId);
        setSessionId(session.id);
        setPending({ kind: "email", text });
        focusComposer();
        return;
      }
      resetComposer();
      focusComposer();
      await composeEmail(text);
    },
    [
      addSession,
      composeEmail,
      composerText,
      ensureConnected,
      focusComposer,
      projectId,
      resetComposer,
      sessionId,
      setActiveView,
      setSessionId,
    ],
  );

  const handleTasks = useCallback(
    async (override?: string) => {
      const text = (override ?? composerText).trim();
      if (!text) {
        toast.message("Describe the work and I'll break it into tasks.");
        return;
      }
      if (!(await ensureConnected())) return;
      setActiveView("chat");
      restoreFocusAfterRunRef.current = true;

      if (!sessionId) {
        if (!projectId) {
          toast.error("Select a project to start chatting.");
          return;
        }
        resetComposer();
        const session = await addSession(projectId);
        setSessionId(session.id);
        setPending({ kind: "tasks", text });
        focusComposer();
        return;
      }
      resetComposer();
      focusComposer();
      await proposeTasks(text);
    },
    [
      addSession,
      composerText,
      ensureConnected,
      focusComposer,
      projectId,
      proposeTasks,
      resetComposer,
      sessionId,
      setActiveView,
      setSessionId,
    ],
  );

  // Flush a queued action once the freshly created session becomes active.
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

  useEffect(() => {
    if (isBusy || !restoreFocusAfterRunRef.current) return;
    restoreFocusAfterRunRef.current = false;
    focusComposer();
  }, [focusComposer, isBusy]);

  useEffect(() => {
    if (isBusy) {
      queueDispatchingRef.current = false;
      return;
    }
    if (queueDispatchingRef.current || queuedMessages.length === 0 || !sessionId) return;
    const [next, ...rest] = queuedMessages;
    queueDispatchingRef.current = true;
    setQueuedMessages(rest);
    restoreFocusAfterRunRef.current = true;
    void send(next).catch(() => {
      queueDispatchingRef.current = false;
    });
  }, [isBusy, queuedMessages, send, sessionId]);

  // ---- "/" slash commands -------------------------------------------------
  const slashRaw = composerText.startsWith("/") ? composerText.slice(1) : null;
  const slashActive = slashRaw !== null && !isBusy;
  const slashToken = (slashRaw ?? "").trimStart().split(/\s+/)[0]?.toLowerCase() ?? "";
  const slashPayload = slashRaw ? slashRaw.replace(/^\s*\S+\s*/, "").trim() : "";
  const filteredCommands = slashActive
    ? slashCommands.filter(
        (command) =>
          !slashToken ||
          command.keyword.includes(slashToken) ||
          command.label.toLowerCase().includes(slashToken),
      )
    : [];
  const clampedSlashIndex = Math.min(slashIndex, Math.max(0, filteredCommands.length - 1));

  const runSlashCommand = (command: SlashCommand) => {
    const payload = slashPayload;
    switch (command.id) {
      case "plan":
        setComposerMode("plan");
        resetComposer();
        focusComposer();
        break;
      case "auto":
        setComposerMode("auto");
        resetComposer();
        focusComposer();
        break;
      case "generate":
        resetComposer();
        void generatePlan();
        break;
      case "email":
        resetComposer();
        if (payload) void handleEmail(payload);
        else {
          toast.message("Type the email after the command, e.g. /email follow up with Sam");
          focusComposer();
        }
        break;
      case "tasks":
        resetComposer();
        if (payload) void handleTasks(payload);
        else {
          toast.message("Describe the work after the command, e.g. /tasks launch checklist");
          focusComposer();
        }
        break;
      case "attach":
        resetComposer();
        fileInputRef.current?.click();
        break;
    }
    setSlashIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashActive && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runSlashCommand(filteredCommands[clampedSlashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        resetComposer();
        return;
      }
    }
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
    focusComposer();
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
              <ContextChipBadge key={chip.id} chip={chip} onRemove={removeContextChip} />
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

        {sessionId && composerMode === "plan" && !isBusy && planIntake ? (
          <PlanIntakeCard
            question={planIntake.question}
            choices={planIntake.chips}
            ready={planIntake.ready}
            progress={planIntake.progress}
            busy={planBusy}
            onChoose={(choice) => void handleSend(choice)}
            onGenerate={() => void generatePlan()}
            onSkip={() =>
              void handleSend("Skip this question and continue with the next useful planning question.")
            }
            onFocusComposer={focusComposer}
          />
        ) : null}

        <ComposerStatus activities={activities} queued={queuedMessages.length} busy={isBusy} />

        <div
          className="group relative rounded-[1.4rem] border border-border bg-composer shadow-[0_18px_50px_-28px_oklch(0_0_0/0.85)] transition-all duration-200 focus-within:border-foreground/20 focus-within:shadow-[0_22px_60px_-26px_oklch(0_0_0/0.95)]"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {slashActive ? (
            <ComposerSlashMenu
              commands={filteredCommands}
              activeIndex={clampedSlashIndex}
              onSelect={runSlashCommand}
            />
          ) : null}

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
              connected ? "What should we tackle?  (/ for commands)" : "Configure a chat provider to enable chat"
            }
            rows={1}
            className={cn(
              "field-sizing-content max-h-40 min-h-0 resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/70",
              "focus-visible:border-0 focus-visible:ring-0",
              "disabled:bg-transparent dark:bg-transparent",
            )}
          />

          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground"
                      aria-label="More actions"
                      title="Actions"
                      disabled={isBusy}
                    />
                  }
                >
                  <Plus />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-52">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Paperclip data-icon="inline-start" />
                    Attach files
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleEmail()}>
                    <Mail data-icon="inline-start" />
                    Draft email
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleTasks()}>
                    <ListTodo data-icon="inline-start" />
                    Propose tasks
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void generatePlan()}>
                    <ClipboardList data-icon="inline-start" />
                    Generate plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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
            </div>

            <div className="flex shrink-0 items-center gap-1">
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
              ) : null}
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={!composerText.trim() && attachments.length === 0}
                className="rounded-full transition-transform hover:scale-105 active:scale-95"
                aria-label={isBusy ? "Queue message" : "Send message"}
                title={isBusy ? "Queue message" : "Send message"}
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
