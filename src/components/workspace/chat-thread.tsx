import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/workspace/chat-message";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

const thinkingPhrases = [
  "Dexter is thinking through the request",
  "Dexter is pondering the useful angle",
  "Dexter is lining up the context",
  "Dexter is checking the next move",
];

function AsciiSpinner({ className }: { className?: string }) {
  const frames = ["|", "/", "-", "\\"];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrame((current) => (current + 1) % frames.length);
    }, 140);

    return () => window.clearInterval(interval);
  }, [frames.length]);

  return (
    <span aria-hidden className={cn("inline-block w-[1ch] font-mono", className)}>
      {frames[frame]}
    </span>
  );
}

function ThinkingPhrase() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % thinkingPhrases.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, []);

  return <span>{thinkingPhrases[phraseIndex]}</span>;
}

function AssistantWarmupMessage() {
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <span className="font-medium">Assistant</span>
        <span>now</span>
      </div>
      <div className="max-w-[88%] px-1 py-1">
        <div className="flex items-start gap-2">
          <AsciiSpinner className="mt-0.5 shrink-0 text-xs text-active" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">
              <ThinkingPhrase />
            </div>
            <div className="mt-3 grid gap-2">
              <div className="h-2 w-48 rounded-full bg-muted nexus-shimmer" />
              <div className="h-2 w-72 max-w-full rounded-full bg-muted nexus-shimmer" />
              <div className="h-2 w-36 rounded-full bg-muted nexus-shimmer" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatThread() {
  const { messages, status } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-chat-surface px-6 pb-32">
        <Empty className="max-w-md border border-dashed border-border bg-card/50">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquare />
            </EmptyMedia>
            <EmptyTitle>Start a conversation</EmptyTitle>
            <EmptyDescription>
              Ask about tasks, draft follow-ups, or brainstorm next steps for this project.
            </EmptyDescription>
          </EmptyHeader>
          {!connected && (
            <EmptyContent>
              <Button onClick={() => setSettingsOpen(true)}>Open model settings</Button>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );
  }

  const streamingAssistantId =
    status === "streaming"
      ? [...messages].reverse().find((message) => message.role === "assistant")?.id
      : undefined;
  const hasAssistantInFlight = Boolean(streamingAssistantId);

  return (
    <ScrollArea className="h-full w-full min-w-0 bg-chat-surface">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 pb-32">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={message.id === streamingAssistantId}
          />
        ))}
        {status === "submitted" && !hasAssistantInFlight && <AssistantWarmupMessage />}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
