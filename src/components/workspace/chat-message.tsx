import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { toast } from "sonner";

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

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function StreamingPlaceholder() {
  return (
    <div className="flex min-w-52 flex-col gap-2 py-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AsciiSpinner className="text-active" />
        <ThinkingPhrase />
      </div>
      <div className="h-2 w-48 rounded-full bg-muted nexus-shimmer" />
      <div className="h-2 w-64 max-w-full rounded-full bg-muted nexus-shimmer" />
      <div className="h-2 w-36 rounded-full bg-muted nexus-shimmer" />
    </div>
  );
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-active" />;
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
          "max-w-[88%] text-sm leading-relaxed",
          isUser
            ? "rounded-2xl bg-muted px-4 py-2.5 text-foreground"
            : "px-1 py-1 text-foreground",
        )}
      >
        {isStreaming && !text ? (
          <StreamingPlaceholder />
        ) : isUser ? (
          text
        ) : (
          <div className="flex flex-col gap-3">
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <div
                    key={`${part.type}-${index}`}
                    className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                  </div>
                );
              }

              return null;
            })}
            {isStreaming && text && <StreamingCursor />}
          </div>
        )}
      </div>
    </div>
  );
}
