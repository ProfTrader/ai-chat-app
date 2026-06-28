import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Brain, Eye, FileText, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  fetchAgentFiles,
  saveAgentFile,
  type AgentFile,
} from "@/lib/agent-files/client";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function AgentFilesPanel() {
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAgentFiles()
      .then((loaded) => {
        if (!active) return;
        setFiles(loaded);
        setSelected((current) => current ?? loaded[0]?.name ?? null);
      })
      .catch(() => active && toast.error("Couldn't load agent files. Is the API running?"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const activeFile = useMemo(
    () => files.find((file) => file.name === selected) ?? null,
    [files, selected],
  );

  const selectFile = (name: string) => {
    setSelected(name);
    setMode("view");
    const file = files.find((f) => f.name === name);
    setDraft(file?.content ?? "");
  };

  const startEdit = () => {
    setDraft(activeFile?.content ?? "");
    setMode("edit");
  };

  const save = async () => {
    if (!activeFile) return;
    setSaving(true);
    try {
      const updated = await saveAgentFile(activeFile.name, draft, "user");
      setFiles((current) => current.map((f) => (f.name === updated.name ? updated : f)));
      setMode("view");
      toast.success(`Saved ${updated.title}`);
    } catch {
      toast.error("Failed to save file.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading agent files…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Dexter's durable brain. It reads these every turn and updates memory &amp; session
        notes on important changes. Edit any file to steer the agent.
      </p>

      <div className="flex flex-col gap-1">
        {files.map((file) => {
          const isActive = file.name === selected;
          return (
            <button
              key={file.name}
              type="button"
              onClick={() => selectFile(file.name)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                isActive
                  ? "border-border bg-muted/70"
                  : "border-transparent hover:bg-muted/40",
              )}
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {file.title}
                  {file.updatedBy === "agent" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-active/10 px-1.5 py-0.5 text-[10px] font-medium text-active">
                      <Brain className="size-2.5" /> agent
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{file.description}</span>
                <span className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {file.name} · {file.updatedBy === "system" ? "seeded" : `updated by ${file.updatedBy}`}{" "}
                  {relativeTime(file.updatedAt)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {activeFile && (
        <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{activeFile.name}</span>
            <div className="flex items-center gap-1">
              {mode === "view" ? (
                <Button size="xs" variant="ghost" onClick={startEdit}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setMode("view");
                      setDraft(activeFile.content);
                    }}
                  >
                    <RotateCcw className="size-3.5" /> Cancel
                  </Button>
                  <Button size="xs" onClick={() => void save()} disabled={saving}>
                    {saving ? <Spinner className="size-3.5" /> : <Eye className="size-3.5" />}
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {mode === "view" ? (
            <div
              className={cn(
                "prose prose-sm max-h-[42vh] max-w-none overflow-y-auto text-foreground",
                "[&_a]:text-active",
                "[&_h1]:mb-2 [&_h1]:mt-1 [&_h1]:text-base [&_h1]:font-semibold",
                "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold",
                "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium",
                "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
                "[&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_p]:leading-6 [&_ul]:my-1.5",
                "[&_strong]:font-semibold",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeFile.content}</ReactMarkdown>
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="max-h-[42vh] min-h-[220px] resize-none font-mono text-xs leading-5"
            />
          )}
        </div>
      )}
    </div>
  );
}
