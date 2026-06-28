import { ArrowUpRight, Check, Copy, FileText, ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { EmailArtifact } from "@/components/workspace/email-artifact";
import { TaskProposalArtifact } from "@/components/workspace/task-proposal-artifact";
import { InteractiveQuestions } from "@/components/workspace/interactive-questions";
import { DocArtifact } from "@/components/workspace/doc-artifact";
import { DeliveryChoice } from "@/components/workspace/delivery-choice";
import { parseMessageAttachments, formatBytes } from "@/lib/chat/attachments";
import { parseEmailMarker } from "@/lib/email/client";
import { parseTasksMarker } from "@/lib/tasks/client";
import { parseClarifyMarker } from "@/lib/clarify/client";
import { parseDocMarker, parseDeliveryMarker } from "@/lib/docs/client";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
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
      <MarkerContent className="shimmer shimmer-duration-1000">{label}</MarkerContent>
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
  const headings = ["## Production stream", "## HTML production stream"];
  const match = headings
    .map((heading) => ({ heading, index: content.indexOf(heading) }))
    .filter((item) => item.index !== -1)
    .sort((a, b) => a.index - b.index)[0];
  if (!match) return null;

  const before = content.slice(0, match.index).trim();
  const afterHeading = content.slice(match.index + match.heading.length).trim();
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
        <div className="text-xs font-medium text-muted-foreground">Production stream</div>
        {stream.current ? (
          <Marker role="status" className="text-sm">
            <MarkerIcon>
              {isActive ? (
                <Spinner role="presentation" aria-hidden="true" className="text-active" />
              ) : (
                <Check className="text-active" />
              )}
            </MarkerIcon>
            <MarkerContent className={cn(isActive && "shimmer shimmer-duration-1000")}>
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
  showStreamingStatus?: boolean;
}

export function ChatMessage({
  message,
  isStreaming,
  showStreamingStatus = true,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const { attachments, cleanText: textWithoutFiles } = parseMessageAttachments(text);
  const { cleanText: textWithoutEmail } = parseEmailMarker(textWithoutFiles);
  const { cleanText: textWithoutTasks } = parseTasksMarker(textWithoutEmail);
  const { cleanText: textWithoutAsk } = parseClarifyMarker(textWithoutTasks);
  const { cleanText: textWithoutDoc } = parseDocMarker(textWithoutAsk);
  const { cleanText: textWithoutDeliver } = parseDeliveryMarker(textWithoutDoc);
  const { runId, cleanText } = parseViewBriefMarker(textWithoutDeliver);
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
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar className="bg-transparent">
        <Avatar size="sm" className={isUser ? "bg-muted" : "bg-primary/10"}>
          <AvatarFallback className={cn(isUser ? "bg-muted" : "bg-primary/10 text-active")}>
            {isUser ? "ME" : "DX"}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent
        className={cn(
          "max-w-[min(42rem,calc(100%-2.5rem))]",
          isUser ? "items-end" : "items-start",
        )}
      >
        {showStreamingStatus && isStreaming && !text ? (
          <StreamingStatus label="Dexter is thinking..." />
        ) : isUser ? (
          <div className="flex flex-col items-end gap-1.5">
            {attachments.length > 0 && (
              <AttachmentGroup className="max-w-[min(34rem,82%)] justify-end">
                {attachments.map((attachment, index) => (
                  <Attachment key={`${attachment.name}-${index}`} size="sm">
                    <AttachmentMedia variant={attachment.kind === "image" ? "image" : "icon"}>
                      {attachment.kind === "image" ? <ImageIcon /> : <FileText />}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{attachment.name}</AttachmentTitle>
                      <AttachmentDescription>{formatBytes(attachment.size)}</AttachmentDescription>
                    </AttachmentContent>
                  </Attachment>
                ))}
              </AttachmentGroup>
            )}
            {cleanText && (
              <Bubble align="end" variant="default" className="max-w-[min(34rem,82%)]">
                <BubbleContent
                  className="rounded-2xl px-4 py-2.5 text-left shadow-sm"
                  style={{ overflowWrap: "normal", wordBreak: "normal" }}
                >
                  {cleanText}
                </BubbleContent>
              </Bubble>
            )}
          </div>
        ) : (
          <BubbleGroup>
            {message.parts.map((part, index) => {
              if (part.type !== "text") return null;

              const { email, cleanText: textWithoutEmailPart } = parseEmailMarker(part.text);
              const { tasks: proposedTasks, cleanText: textWithoutTasksPart } =
                parseTasksMarker(textWithoutEmailPart);
              const { payload: clarifyPayload, cleanText: textWithoutAskPart } =
                parseClarifyMarker(textWithoutTasksPart);
              const { payload: docPayload, cleanText: textWithoutDocPart } =
                parseDocMarker(textWithoutAskPart);
              const { payload: deliveryPayload, cleanText: textWithoutDeliverPart } =
                parseDeliveryMarker(textWithoutDocPart);
              const partText = parseViewBriefMarker(textWithoutDeliverPart).cleanText;
              if (
                !partText &&
                !email &&
                !proposedTasks &&
                !clarifyPayload &&
                !docPayload &&
                !deliveryPayload
              )
                return null;

              return (
                <div key={`${part.type}-${index}`} className="flex flex-col gap-2">
                  {partText && (
                    <Bubble variant="muted" className="max-w-[min(38rem,86%)]">
                      <BubbleContent className="flex flex-col gap-2.5 rounded-2xl border border-border/70 px-4 py-3 text-foreground shadow-sm">
                        <ProductionStream content={partText} isStreaming={isStreaming} />
                      </BubbleContent>
                    </Bubble>
                  )}
                  {email && <EmailArtifact email={email} />}
                  {proposedTasks && proposedTasks.length > 0 && (
                    <TaskProposalArtifact tasks={proposedTasks} />
                  )}
                  {clarifyPayload && <InteractiveQuestions payload={clarifyPayload} />}
                  {docPayload && <DocArtifact payload={docPayload} />}
                  {deliveryPayload && <DeliveryChoice payload={deliveryPayload} />}
                </div>
              );
            })}
          </BubbleGroup>
        )}

        {(!isUser && (cleanText || runId || (showStreamingStatus && isStreaming && text))) && (
          <MessageFooter className="gap-1 px-1">
            {showStreamingStatus && isStreaming && text ? (
              <StreamingStatus label="Calling Moonshot..." />
            ) : null}
            {runId ? (
              <Button size="sm" variant="outline" onClick={viewBrief}>
                View on canvas
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
