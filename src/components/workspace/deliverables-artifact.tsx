import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileCode2, FileText, MonitorPlay, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDataStore } from "@/stores/data-store";
import {
  buildPlanDeckHtml,
  buildPlanMarkdown,
  deliverableSlug,
  type DeliverableInput,
} from "@/lib/automation/client";
import { buildPptx, planToSlides } from "@/lib/automation/pptx";

const proseClasses = cn(
  "prose prose-sm max-w-none text-foreground",
  "[&_a]:text-active",
  "[&_h1]:mb-2 [&_h1]:mt-1 [&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium",
  "[&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_table]:text-xs [&_ul]:my-1.5",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1",
);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DeliverablesArtifact({ planId }: { planId: string }) {
  const plan = useDataStore((s) => s.plans.find((p) => p.id === planId));
  const allAutomations = useDataStore((s) => s.automations);
  const allSchedule = useDataStore((s) => s.scheduleEntries);
  const projectName = useDataStore(
    (s) => s.projects.find((p) => p.id === plan?.projectId)?.name,
  );
  const [open, setOpen] = useState(false);

  const automations = useMemo(
    () => allAutomations.filter((r) => r.planId === planId),
    [allAutomations, planId],
  );
  const schedule = useMemo(
    () => allSchedule.filter((e) => e.planId === planId),
    [allSchedule, planId],
  );

  const input: DeliverableInput | null = useMemo(
    () => (plan ? { plan, automations, schedule, firmName: projectName } : null),
    [plan, automations, schedule, projectName],
  );

  if (!plan || !input) return null;

  const slug = deliverableSlug(plan);
  const markdown = buildPlanMarkdown(input);

  const downloadMd = () =>
    downloadBlob(new Blob([markdown], { type: "text/markdown" }), `${slug}.md`);

  const downloadHtml = () =>
    downloadBlob(
      new Blob([buildPlanDeckHtml(input)], { type: "text/html;charset=utf-8" }),
      `${slug}.html`,
    );

  const openPresentation = () => {
    const blob = new Blob([buildPlanDeckHtml(input)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");
    if (!opened) {
      // Popup blocked (or sandboxed) — fall back to downloading the deck.
      downloadBlob(blob, `${slug}.html`);
      toast.message("Opened as a download", {
        description: "Your environment blocked a new tab, so the deck was downloaded instead.",
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadPptx = () => {
    try {
      const blob = buildPptx(planToSlides(input));
      downloadBlob(blob, `${slug}.pptx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't build the .pptx file.");
    }
  };

  const formats: { label: string; ext: string; icon: typeof FileText; onClick: () => void }[] = [
    { label: "Markdown", ext: ".md", icon: FileText, onClick: downloadMd },
    { label: "Presentation", ext: ".html", icon: FileCode2, onClick: downloadHtml },
    { label: "PowerPoint", ext: ".pptx", icon: Package, onClick: downloadPptx },
  ];

  return (
    <>
      <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
            <Package className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">Deliverables</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {slug}.md · {slug}.html · {slug}.pptx
            </span>
          </div>
          <Button size="xs" onClick={openPresentation}>
            <MonitorPlay className="size-3.5" /> Present
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3">
          {formats.map((format) => (
            <button
              key={format.ext}
              type="button"
              onClick={format.onClick}
              className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                <format.icon className="size-4" />
              </span>
              <span className="text-xs font-medium">{format.label}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                <Download className="size-3" />
                {format.ext}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t border-border bg-muted/20 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Preview the document
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-3">
            <FileText className="size-4 text-active" />
            <DialogTitle className="text-sm">
              {plan.title}{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground">{slug}.md</span>
            </DialogTitle>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={downloadMd}>
              <Download className="size-3.5" /> Download .md
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-chat-surface px-6 py-6">
            <div className="mx-auto max-w-2xl">
              <div className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
