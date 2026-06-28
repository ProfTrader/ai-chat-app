import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { UIMessage } from "ai";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { ChatMessage } from "@/components/workspace/chat-message";
import { useChatSession, type ChatActivity } from "@/lib/chat/chat-session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

const STARTER_PROMPTS = [
  "What should we tackle this week?",
  "Draft a project brief for our launch",
  "Turn our plan into tasks with owners",
  "Draft an outreach email to a prospect",
];

const thinkingPhrases = [
  "is reasoning through the details",
  "is thinking through the request",
  "is lining up the context",
  "is checking the next move",
  "is preparing the answer",
];

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

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-active/80 motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

function LiveAssistantStatus({ activity }: { activity?: ChatActivity }) {
  const label = activity?.detail
    ? `${activity.label}: ${activity.detail}`
    : activity?.label;

  return (
    <Message align="start" role="status" aria-live="polite">
      <MessageAvatar className="bg-transparent">
        <Avatar size="sm" className="bg-primary/10">
          <AvatarFallback className="bg-primary/10 text-active">DX</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="items-start">
        <div className="flex w-fit items-center gap-2.5 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2 shadow-sm">
          <TypingDots />
          <span className="shimmer shimmer-duration-1000 text-xs text-muted-foreground">
            {label ? (
              label
            ) : (
              <>
                <span className="font-medium text-foreground">Dexter</span> <ThinkingPhrase />
              </>
            )}
          </span>
        </div>
      </MessageContent>
    </Message>
  );
}

function messageTextLength(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim().length;
}

export function ChatThread() {
  const { messages, status, activities, pendingBriefPlan, artifactBusy } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const setComposerText = useChatStore((s) => s.setComposerText);

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
              Chat is the hub — from here Dexter can spin up briefs, tasks, boards, teams, and emails.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {connected ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setComposerText(prompt)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <Button onClick={() => setSettingsOpen(true)}>Open model settings</Button>
            )}
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const lastMessage = messages[messages.length - 1];
  const streamingAssistantId =
    status === "streaming" && lastMessage?.role === "assistant" ? lastMessage.id : undefined;
  const streamingTextLength =
    streamingAssistantId && lastMessage ? messageTextLength(lastMessage) : 0;

  const runningActivity = [...activities]
    .reverse()
    .find((activity) => activity.status === "running");

  // The assistant is "visibly responding" when it is streaming actual text, or
  // when an artifact run has already placed a non-empty assistant message last.
  const assistantVisible =
    (status === "streaming" && streamingTextLength > 0) ||
    (artifactBusy &&
      lastMessage?.role === "assistant" &&
      messageTextLength(lastMessage) > 0);

  const agentWorking =
    status === "submitted" || status === "streaming" || artifactBusy || Boolean(runningActivity);
  const showLiveStatus = agentWorking && !assistantVisible;

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller className="h-full w-full min-w-0 bg-chat-surface">
        <MessageScrollerViewport className="scroll-fade-y">
          <MessageScrollerContent
            aria-busy={agentWorking}
            className={cn(
              "mx-auto w-full max-w-3xl gap-5 px-5 py-6",
              pendingBriefPlan ? "pb-56" : "pb-32",
            )}
          >
            {messages.map((message) => {
              // Hide the empty assistant placeholder during the thinking phase —
              // the live status row below represents it (with an aligned avatar).
              if (message.id === streamingAssistantId && streamingTextLength === 0) {
                return null;
              }
              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <ChatMessage
                    message={message}
                    isStreaming={message.id === streamingAssistantId}
                    showStreamingStatus={false}
                  />
                </MessageScrollerItem>
              );
            })}
            {showLiveStatus && (
              <MessageScrollerItem messageId="assistant-live-status">
                <LiveAssistantStatus activity={runningActivity} />
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
