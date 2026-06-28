import { useMemo, useState } from "react";
import { Check, MessagesSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import type { ClarifyMarkerPayload, ClarifyQuestion } from "@/lib/clarify/client";

export function InteractiveQuestions({ payload }: { payload: ClarifyMarkerPayload }) {
  const { submitClarifyAnswers } = useChatSession();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const questions = payload.plan.questions;

  const select = (question: ClarifyQuestion, option: string) => {
    if (submitted) return;
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.multi) {
        return {
          ...prev,
          [question.id]: current.includes(option)
            ? current.filter((value) => value !== option)
            : [...current, option],
        };
      }
      return { ...prev, [question.id]: current.includes(option) ? [] : [option] };
    });
  };

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length,
    [answers, questions],
  );
  const canSubmit = (answeredCount > 0 || note.trim().length > 0) && !submitted && !busy;

  const submit = async () => {
    setBusy(true);
    const lines = questions
      .map((q) => {
        const picked = answers[q.id] ?? [];
        return picked.length ? `- ${q.prompt} → ${picked.join(", ")}` : null;
      })
      .filter((line): line is string => Boolean(line));
    if (note.trim()) lines.push(`- Additional notes: ${note.trim()}`);
    const summary = lines.join("\n") || "(no strong preferences — use your best judgment)";
    try {
      await submitClarifyAnswers(payload.request, summary);
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <MessagesSquare className="size-4" />
        </span>
        <span className="text-sm font-medium">A few quick questions</span>
        {!submitted && (
          <span className="ml-auto text-xs text-muted-foreground">
            {answeredCount}/{questions.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {payload.plan.intro && (
          <p className="text-sm leading-relaxed text-muted-foreground">{payload.plan.intro}</p>
        )}

        {questions.map((question) => {
          const picked = answers[question.id] ?? [];
          return (
            <div key={question.id} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                {question.prompt}
                {question.multi && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(pick any)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const active = picked.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={submitted}
                      onClick={() => select(question, option)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                        submitted && "opacity-70",
                      )}
                    >
                      {active && <Check className="size-3.5" />}
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!submitted && (
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything else I should know? (optional)"
            className="resize-none rounded-xl text-sm"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
        {submitted ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-active" />
            Answers sent — Dexter is on it.
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">Tap to answer, then continue.</span>
            <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Sending…" : payload.plan.cta || "Continue"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
