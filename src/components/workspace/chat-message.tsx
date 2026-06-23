import { cn } from "@/lib/utils";
import type { Message } from "@/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-1 text-xs text-muted-foreground",
          isUser && "flex-row-reverse",
        )}
      >
        <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>

      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-foreground text-background"
            : "bg-muted/60 text-foreground",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}
