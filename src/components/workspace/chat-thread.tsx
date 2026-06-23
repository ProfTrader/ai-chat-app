import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ChatMessage } from "@/components/workspace/chat-message";
import { useDataStore } from "@/stores/data-store";

export function ChatThread({ sessionId }: { sessionId: string }) {
  const getMessagesBySession = useDataStore((s) => s.getMessagesBySession);
  const messages = useMemo(
    () => getMessagesBySession(sessionId),
    [getMessagesBySession, sessionId],
  );

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
              Ask about tasks, draft follow-ups, or brainstorm next steps for this
              project. Your messages stay in this session.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full min-w-0 bg-chat-surface">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 pb-32">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
