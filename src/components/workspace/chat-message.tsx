import { Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { toast } from "sonner";

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const timestamp = formatRelativeTime(new Date().toISOString());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      className={cn(
        "group flex w-full flex-col gap-1.5",
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
        <span>{timestamp}</span>
        {!isUser && text && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => void handleCopy()}
          >
            <Copy />
          </Button>
        )}
      </div>

      <div
        className={cn(
          "max-w-[88%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-message-incoming-border bg-message-incoming-bg text-foreground",
        )}
      >
        {isStreaming && !text ? (
          <div className="flex items-center gap-2">
            <Spinner />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : isUser ? (
          text
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
