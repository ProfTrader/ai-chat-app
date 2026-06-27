import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { ChatMessage } from "@/components/workspace/chat-message";
import { useChatSession, type ChatActivity } from "@/lib/chat/chat-session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

const thinkingPhrases = [
  "Dexter is thinking through the request",
  "Dexter is pondering the useful angle",
  "Dexter is lining up the context",
  "Dexter is checking the next move",
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

function AssistantWarmupMarker() {
  return (
    <Message align="start" className="items-end">
      <MessageAvatar className="bg-transparent">
        <Avatar size="sm" className="bg-primary/10">
          <AvatarFallback className="bg-primary/10 text-active">DX</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="max-w-[min(42rem,calc(100%-2.5rem))] gap-1.5">
        <MessageHeader className="px-1">
          <span>Dexter</span>
        </MessageHeader>
        <Marker role="status" className="w-fit px-1">
          <MarkerIcon>
            <Spinner role="presentation" aria-hidden="true" className="text-active" />
          </MarkerIcon>
          <MarkerContent className="shimmer">
            <ThinkingPhrase />
          </MarkerContent>
        </Marker>
      </MessageContent>
    </Message>
  );
}

function ActivityStatusDot({ status }: { status: ChatActivity["status"] }) {
  return (
    <span
      className={cn(
        "mt-1 size-2 shrink-0 rounded-full",
        status === "running" && "animate-pulse bg-active",
        status === "complete" && "bg-success",
        status === "error" && "bg-destructive",
      )}
    />
  );
}

function AgentActivityTrail({ activities }: { activities: ChatActivity[] }) {
  if (activities.length === 0) return null;

  return (
    <Message align="start" className="items-end">
      <MessageAvatar className="bg-transparent">
        <Avatar size="sm" className="bg-primary/10">
          <AvatarFallback className="bg-primary/10 text-active">DX</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="max-w-[min(42rem,calc(100%-2.5rem))] gap-1.5">
        <MessageHeader className="px-1">
          <span>Agent activity</span>
        </MessageHeader>
        <div className="w-fit min-w-72 max-w-full rounded-md border border-border bg-card/70 px-3 py-2 text-xs shadow-sm">
          <div className="space-y-2">
            {activities.slice(-5).map((activity) => (
              <div key={activity.id} className="flex gap-2">
                <ActivityStatusDot status={activity.status} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{activity.label}</p>
                  {activity.detail ? (
                    <p className="mt-0.5 text-muted-foreground">{activity.detail}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

export function ChatThread() {
  const { messages, status, activities, pendingBriefPlan } = useChatSession();
  const connected = useAuthStore((s) => s.status?.connected);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);

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
  const showActivityTrail =
    status === "submitted" ||
    status === "streaming" ||
    activities.some((activity) => activity.status === "running" || activity.status === "error");

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller className="h-full w-full min-w-0 bg-chat-surface">
        <MessageScrollerViewport className="scroll-fade-y">
          <MessageScrollerContent
            aria-busy={status === "submitted" || status === "streaming"}
            className={cn(
              "mx-auto w-full max-w-3xl gap-5 px-5 py-6",
              pendingBriefPlan ? "pb-56" : "pb-32",
            )}
          >
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <ChatMessage
                  message={message}
                  isStreaming={message.id === streamingAssistantId}
                />
              </MessageScrollerItem>
            ))}
            {showActivityTrail && activities.length > 0 && (
              <MessageScrollerItem messageId="agent-activity">
                <AgentActivityTrail activities={activities} />
              </MessageScrollerItem>
            )}
            {status === "submitted" && !hasAssistantInFlight && (
              <MessageScrollerItem messageId="assistant-warmup">
                <AssistantWarmupMarker />
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
