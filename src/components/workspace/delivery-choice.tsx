import { useState } from "react";
import { Check, Send, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/lib/chat/chat-session-provider";
import type { DeliveryPlanPayload } from "@/lib/docs/client";

export function DeliveryChoice({ payload }: { payload: DeliveryPlanPayload }) {
  const { submitDeliveryChoice } = useChatSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (option: string) => {
    if (submitted) return;
    setPicked((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  };

  const canSubmit = (picked.length > 0 || note.trim().length > 0) && !submitted && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await submitDeliveryChoice(payload.request, payload.premise, picked, note.trim());
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[min(40rem,92%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <Truck className="size-4" />
        </span>
        <span className="text-sm font-medium">How should I deliver this?</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Pick one or more — I'll honor this and remember it for next time.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {payload.options.map((option) => {
            const active = picked.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={submitted}
                onClick={() => toggle(option)}
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
        {!submitted && (
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to adjust about the premise first? (optional)"
            className="resize-none rounded-xl text-sm"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
        {submitted ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-active" />
            Got it — delivering and remembering your preference.
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">Your call on delivery.</span>
            <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Sending…" : "Deliver this way"}
              {!busy && <Send className="size-3.5" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
