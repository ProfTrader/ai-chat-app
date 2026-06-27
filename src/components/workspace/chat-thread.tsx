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
import { Spinner } from "@/components/ui/spinner";
import { ChatMessage } from "@/components/workspace/chat-message";
import { useChatSession, type ChatActivity } from "@/lib/chat/chat-session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

const thinkingPhrases = [
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

function LiveAssistantStatus({ activity }: { activity?: ChatActivity }) {
  const label = activity?.detail
    ? `${activity.label}: ${activity.detail}`
    : activity?.label;

  return (
    <Marker role="status" aria-live="polite" className="w-fit pl-10 pr-1 text-xs">
      <MarkerIcon>
        <Spinner role="presentation" aria-hidden="true" className="text-active" />
      </MarkerIcon>
      <MarkerContent className="shimmer shimmer-duration-1000">
        {label ? (
          label
        ) : (
          <>
            <span className="font-medium">Dexter</span>{" "}
            <ThinkingPhrase />
          </>
        )}
      </MarkerContent>
    </Marker>
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
  const runningActivity = [...activities]
    .reverse()
    .find((activity) => activity.status === "running");
  const showLiveStatus =
    status === "submitted" ||
    status === "streaming" ||
    Boolean(runningActivity);

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
                  showStreamingStatus={false}
                />
              </MessageScrollerItem>
            ))}
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
