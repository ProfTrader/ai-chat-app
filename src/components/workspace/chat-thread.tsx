import { useEffect, useRef } from "react";
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
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
