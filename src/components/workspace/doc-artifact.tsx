import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DocArtifactPayload } from "@/lib/docs/client";

const proseClasses = cn(
  "prose prose-sm max-w-none text-foreground",
  "[&_a]:text-active",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_h1]:mb-2 [&_h1]:mt-1 [&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium",
  "[&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_p]:leading-6 [&_ul]:my-1.5",
  "[&_strong]:font-semibold",
);

function downloadMarkdown(payload: DocArtifactPayload) {
  const blob = new Blob([payload.markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocArtifact({ payload }: { payload: DocArtifactPayload }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
            <FileText className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{payload.title}</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {payload.filename} · on canvas
            </span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={() => downloadMarkdown(payload)}>
              <Download className="size-3.5" /> .md
            </Button>
            <Button size="xs" onClick={() => setOpen(true)}>
              <Maximize2 className="size-3.5" /> Open in canvas
            </Button>
          </div>
        </div>
        <div className={cn(proseClasses, "max-h-64 overflow-hidden px-4 py-3")}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.markdown}</ReactMarkdown>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t border-border bg-muted/20 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open full document on canvas
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-3">
            <FileText className="size-4 text-active" />
            <DialogTitle className="text-sm">
              {payload.title}{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {payload.filename}
              </span>
            </DialogTitle>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => downloadMarkdown(payload)}
            >
              <Download className="size-3.5" /> Download .md
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-chat-surface px-6 py-6">
            <div className="mx-auto max-w-2xl">
              <div className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.markdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
