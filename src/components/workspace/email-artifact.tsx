import { useState } from "react";
import { Check, Copy, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EmailDraft } from "@/lib/email/client";

export function EmailArtifact({ email }: { email: EmailDraft }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(
      `${email.to ? `To: ${email.to}\n` : ""}Subject: ${email.subject}\n\n${email.body}`,
    );
    setCopied(true);
    toast.success("Email copied");
    window.setTimeout(() => setCopied(false), 1500);
  };

  const mailto = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(
    email.subject,
  )}&body=${encodeURIComponent(email.body)}`;

  return (
    <div className="w-full max-w-[min(40rem,90%)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-active">
          <Mail className="size-4" />
        </span>
        <span className="text-sm font-medium">Email draft</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => void copy()} aria-label="Copy email">
            {copied ? <Check /> : <Copy />}
          </Button>
          <a
            href={mailto}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open in mail client"
            title="Open in mail client"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="grid grid-cols-[3rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          <span className="text-muted-foreground">To</span>
          <span className="truncate text-foreground">{email.to || "—"}</span>
          <span className="text-muted-foreground">Subject</span>
          <span className="font-medium text-foreground">{email.subject}</span>
        </div>
        <div className="whitespace-pre-wrap border-t border-border pt-3 leading-relaxed text-foreground">
          {email.body}
        </div>
      </div>
    </div>
  );
}
