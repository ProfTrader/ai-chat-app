import { ArrowUpRight, Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDataStore } from "@/stores/data-store";
import { useShellStore } from "@/stores/shell-store";

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function parseViewBriefMarker(text: string) {
  const match = text.match(/\[\[nexus:view-brief:([^\]]+)]]/);
  return {
    runId: match?.[1],
    cleanText: text.replace(/\n?\[\[nexus:view-brief:[^\]]+]]/g, "").trim(),
  };
}

function StreamingStatus({ label }: { label: string }) {
  return (
    <Marker role="status" className="w-fit text-xs">
      <MarkerIcon>
        <Spinner role="presentation" aria-hidden="true" className="text-active" />
      </MarkerIcon>
      <MarkerContent className="shimmer">{label}</MarkerContent>
    </Marker>
  );
}

function renderMarkdown(content: string, key: string) {
  if (!content.trim()) return null;

  return (
    <div
      key={key}
      className={cn(
        "prose prose-sm max-w-none text-foreground",
        "[&_a]:text-active [&_a]:underline-offset-4",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_h1]:mb-2 [&_h1]:mt-1 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium",
        "[&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_p]:leading-7 [&_ul]:my-2",
        "[&_strong]:font-semibold",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function parseProductionStream(content: string) {
  const heading = "## HTML production stream";
  const headingIndex = content.indexOf(heading);
  if (headingIndex === -1) return null;

  const before = content.slice(0, headingIndex).trim();
  const afterHeading = content.slice(headingIndex + heading.length).trim();
  const createdIndex = afterHeading.search(/\nCreated \*\*/);
  const streamText = createdIndex === -1 ? afterHeading : afterHeading.slice(0, createdIndex).trim();
  const after = createdIndex === -1 ? "" : afterHeading.slice(createdIndex).trim();
  const lines = streamText.split("\n").map((line) => line.trim()).filter(Boolean);
  const currentLine = lines.find((line) => line.startsWith("**Current:**"));
  const current = currentLine?.replace(/^\*\*Current:\*\*\s*/, "").trim();
  const completed = lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);

  return { before, current, completed, after };
}

function ProductionStream({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const stream = parseProductionStream(content);
  if (!stream) return renderMarkdown(content, "markdown");
  const isActive = Boolean(stream.current && !stream.after) || Boolean(isStreaming && stream.current);

  return (
    <div className="flex flex-col gap-3">
      {renderMarkdown(stream.before, "before-stream")}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div className="text-xs font-medium text-muted-foreground">HTML production stream</div>
        {stream.current ? (
          <Marker role="status" className="text-sm">
            <MarkerIcon>
              {isActive ? (
                <Spinner role="presentation" aria-hidden="true" className="text-active" />
              ) : (
                <Check className="text-active" />
              )}
            </MarkerIcon>
            <MarkerContent className={cn(isActive && "shimmer")}>
              {stream.current}
            </MarkerContent>
          </Marker>
        ) : null}
        {stream.completed.length > 0 ? (
          <div className="flex flex-col gap-1.5 pt-1">
            {stream.completed.map((item, index) => (
              <Marker key={`${item}-${index}`} className="text-xs">
                <MarkerIcon>
                  <Check className="text-active" />
                </MarkerIcon>
                <MarkerContent>{item}</MarkerContent>
              </Marker>
            ))}
          </div>
        ) : null}
      </div>
      {renderMarkdown(stream.after, "after-stream")}
    </div>
  );
}

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const { runId, cleanText } = parseViewBriefMarker(text);
  const selectWorkRun = useDataStore((state) => state.selectWorkRun);
  const setActiveView = useShellStore((state) => state.setActiveView);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanText);
    toast.success("Copied to clipboard");
  };

  const viewBrief = () => {
    if (!runId) return;
    selectWorkRun(runId);
    setActiveView("briefs");
  };

  return (
    <Message align={isUser ? "end" : "start"} className="items-end">
      <MessageAvatar
        className={cn(
          "bg-transparent",
          isUser ? "opacity-80" : "opacity-100",
        )}
      >
        <Avatar size="sm" className={isUser ? "bg-muted" : "bg-primary/10"}>
          <AvatarFallback className={cn(isUser ? "bg-muted" : "bg-primary/10 text-active")}>
            {isUser ? "Y" : "DX"}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent
        className={cn(
          "max-w-[min(42rem,calc(100%-2.5rem))] gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        <MessageHeader className={cn("px-1", isUser && "justify-end")}>
          <span>{isUser ? "You" : "Dexter"}</span>
        </MessageHeader>

        {isStreaming && !text ? (
          <StreamingStatus label="Dexter is thinking..." />
        ) : isUser ? (
          <Bubble align="end" variant="default" className="max-w-full">
            <BubbleContent className="px-3.5 py-2.5">{cleanText}</BubbleContent>
          </Bubble>
        ) : (
          <Bubble variant="ghost" className="max-w-full">
            <BubbleContent className="flex flex-col gap-2.5 text-foreground">
              {message.parts.map((part, index) => {
                if (part.type !== "text") return null;

                const partText = parseViewBriefMarker(part.text).cleanText;
                if (!partText) return null;

                return (
                  <ProductionStream
                    key={`${part.type}-${index}`}
                    content={partText}
                    isStreaming={isStreaming}
                  />
                );
              })}
            </BubbleContent>
          </Bubble>
        )}

        {(!isUser && (cleanText || runId || (isStreaming && text))) && (
          <MessageFooter className="gap-1 px-1">
            {isStreaming && text ? (
              <StreamingStatus label="Calling Moonshot..." />
            ) : null}
            {runId ? (
              <Button size="sm" variant="outline" onClick={viewBrief}>
                View brief
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            ) : null}
            {cleanText ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100"
                onClick={() => void handleCopy()}
                aria-label="Copy message"
              >
                <Copy />
              </Button>
            ) : null}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}
