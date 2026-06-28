import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Briefcase,
  Building2,
  Camera,
  Check,
  Globe,
  Link as LinkIcon,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  researchBusiness,
  saveFirmProfile,
  type BusinessProfile,
  type OnboardingAnswers,
} from "@/lib/onboarding/client";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useDataStore } from "@/stores/data-store";

type Step = "welcome" | "business" | "domain" | "socials" | "research" | "review";

const FORM_STEPS: Step[] = ["business", "domain", "socials"];

const DOMAIN_OPTIONS = [
  "B2B SaaS",
  "E-commerce / DTC",
  "Agency / Services",
  "Fintech",
  "Healthcare",
  "Real Estate",
  "Education",
  "Marketplace",
  "Media / Creator",
  "Manufacturing",
  "Consulting",
  "Other",
];

const RESEARCH_PHASES = [
  "Reading the details you shared",
  "Analyzing your industry and model",
  "Profiling your ideal customers",
  "Scanning competitors and opportunities",
  "Tailoring your CRM workspace",
];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {FORM_STEPS.map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            index === current ? "w-6 bg-primary" : index < current ? "w-1.5 bg-primary/60" : "w-1.5 bg-border",
          )}
        />
      ))}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <Input className="h-10 rounded-xl" {...props} />
    </label>
  );
}

export function OnboardingFlow() {
  const complete = useOnboardingStore((s) => s.complete);
  const skip = useOnboardingStore((s) => s.skip);
  const existing = useOnboardingStore((s) => s.answers);

  const existingDomainKnown = existing?.domain ? DOMAIN_OPTIONS.includes(existing.domain) : false;

  const [step, setStep] = useState<Step>(existing ? "business" : "welcome");
  const [businessName, setBusinessName] = useState(existing?.businessName ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [domain, setDomain] = useState(
    existingDomainKnown ? existing!.domain : existing?.domain ? "Other" : "",
  );
  const [customDomain, setCustomDomain] = useState(
    existing?.domain && !existingDomainKnown ? existing.domain : "",
  );
  const [goals, setGoals] = useState(existing?.goals ?? "");
  const [website, setWebsite] = useState(existing?.socials?.website ?? "");
  const [linkedin, setLinkedin] = useState(existing?.socials?.linkedin ?? "");
  const [twitter, setTwitter] = useState(existing?.socials?.twitter ?? "");
  const [instagram, setInstagram] = useState(existing?.socials?.instagram ?? "");

  const [researching, setResearching] = useState(false);
  const [phase, setPhase] = useState(0);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resolvedDomain = domain === "Other" ? customDomain : domain;

  const answers: OnboardingAnswers = useMemo(
    () => ({
      businessName: businessName.trim(),
      description: description.trim(),
      domain: resolvedDomain.trim(),
      goals: goals.trim(),
      socials: {
        website: website.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        twitter: twitter.trim() || undefined,
        instagram: instagram.trim() || undefined,
      },
    }),
    [businessName, description, resolvedDomain, goals, website, linkedin, twitter, instagram],
  );

  const runResearch = useCallback(async () => {
    setResearching(true);
    setError(null);
    setProfile(null);
    try {
      const result = await researchBusiness(answers);
      setProfile(result.profile);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed. Please try again.");
    } finally {
      setResearching(false);
    }
  }, [answers]);

  // Kick off research when entering the research step.
  useEffect(() => {
    if (step === "research" && !researching && !profile) {
      void runResearch();
    }
  }, [step, researching, profile, runResearch]);

  // Cycle progress phrases while researching.
  useEffect(() => {
    if (!researching) return;
    setPhase(0);
    const timer = window.setInterval(() => {
      setPhase((p) => Math.min(p + 1, RESEARCH_PHASES.length - 1));
    }, 2600);
    return () => window.clearInterval(timer);
  }, [researching]);

  const finishOnboarding = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await saveFirmProfile(answers, profile);
    } catch {
      // Saving the firm file is best-effort; still enter the workspace.
    } finally {
      setSaving(false);
      if (answers.businessName) {
        useDataStore.getState().applyFirmName(answers.businessName);
      }
      complete(answers, profile);
    }
  };

  const formIndex = FORM_STEPS.indexOf(step as Step);
  const canContinueBusiness = businessName.trim().length > 1;
  const canContinueDomain = resolvedDomain.trim().length > 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
      <div className="my-auto w-full max-w-2xl rounded-3xl border border-border bg-pane shadow-[0_30px_80px_-30px_oklch(0_0_0/0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              NX
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Set up your workspace</p>
              <p className="text-xs text-muted-foreground">Nexus learns your business first</p>
            </div>
          </div>
          {formIndex >= 0 ? <StepDots current={formIndex} /> : null}
        </div>

        {/* Body */}
        <div className="px-6 py-7">
          {step === "welcome" && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-muted text-foreground">
                <Sparkles className="size-7" />
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Welcome to Nexus</h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                  Answer a few quick questions about your business. Dexter will research it and tailor
                  your projects, tasks, and the way your AI teammate works.
                </p>
              </div>
              <div className="mt-2 flex flex-col items-center gap-2">
                <Button size="lg" className="rounded-full px-6" onClick={() => setStep("business")}>
                  Get started
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={skip}
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === "business" && (
            <div className="flex flex-col gap-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Tell us about your business</h2>
                <p className="text-sm text-muted-foreground">The basics so we know who we're working with.</p>
              </div>
              <Field
                icon={Building2}
                label="Business name"
                placeholder="e.g. Acme Analytics"
                value={businessName}
                autoFocus
                onChange={(e) => setBusinessName(e.target.value)}
              />
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  What does your business do?
                </span>
                <Textarea
                  rows={3}
                  className="resize-none rounded-xl"
                  placeholder="One or two sentences on what you offer and to whom."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          )}

          {step === "domain" && (
            <div className="flex flex-col gap-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">What domain are you in?</h2>
                <p className="text-sm text-muted-foreground">Pick the closest fit — it shapes the research.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {DOMAIN_OPTIONS.map((option) => {
                  const active = domain === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDomain(option)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {domain === "Other" && (
                <Field
                  icon={Target}
                  label="Your domain"
                  placeholder="Describe your industry"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                />
              )}
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" />
                  What are your main goals right now? <span className="text-muted-foreground/60">(optional)</span>
                </span>
                <Textarea
                  rows={2}
                  className="resize-none rounded-xl"
                  placeholder="e.g. land first 50 customers, reduce churn, hire a sales team."
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                />
              </label>
            </div>
          )}

          {step === "socials" && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Where can we find you?</h2>
                <p className="text-sm text-muted-foreground">
                  Share any public profiles — Dexter uses them to research your business. All optional.
                </p>
              </div>
              <Field icon={Globe} label="Website" placeholder="https://yourcompany.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
              <Field icon={Briefcase} label="LinkedIn" placeholder="linkedin.com/company/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field icon={AtSign} label="X / Twitter" placeholder="@handle" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                <Field icon={Camera} label="Instagram" placeholder="@handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
              </div>
            </div>
          )}

          {step === "research" && (
            <div className="flex flex-col items-center gap-6 py-10 text-center">
              {error ? (
                <>
                  <span className="grid size-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
                    <LinkIcon className="size-7" />
                  </span>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold">Research hit a snag</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">{error}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-full" onClick={() => setStep("socials")}>
                      Back
                    </Button>
                    <Button className="rounded-full" onClick={() => void runResearch()}>
                      Try again
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="relative grid size-16 place-items-center rounded-2xl bg-muted">
                    <Sparkles className="size-7 text-foreground" />
                    <span className="absolute inset-0 rounded-2xl ring-2 ring-primary/30 ring-offset-2 ring-offset-pane motion-safe:animate-pulse" />
                  </span>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Researching {businessName || "your business"}…
                    </h2>
                    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Spinner className="size-3.5" />
                      <span className="shimmer shimmer-duration-1000">{RESEARCH_PHASES[phase]}</span>
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "review" && profile && (
            <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Here's what we found</h2>
                <p className="text-sm text-muted-foreground">Dexter will use this to tailor your workspace.</p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="max-w-full whitespace-normal font-normal">
                    {profile.industry}
                  </Badge>
                  <Badge variant="outline" className="max-w-full whitespace-normal font-normal">
                    {profile.businessModel}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-foreground">{profile.summary}</p>
                <p className="mt-3 text-sm italic leading-relaxed text-muted-foreground">
                  “{profile.valueProposition}”
                </p>
              </div>

              <ReviewList icon={Target} title="Target customers" items={profile.targetCustomers} />
              {profile.competitors.length > 0 && (
                <ReviewList icon={Building2} title="Likely competitors" items={profile.competitors} />
              )}
              <ReviewList icon={Sparkles} title="Opportunities to watch" items={profile.opportunities} />

              <div className="space-y-2">
                <SectionTitle icon={Check} title="Suggested projects" />
                <div className="grid gap-2">
                  {profile.suggestedProjects.map((p) => (
                    <div key={p.name} className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <SectionTitle icon={Check} title="First tasks" />
                <div className="flex flex-col gap-1.5">
                  {profile.suggestedTasks.map((t) => (
                    <div key={t.title} className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          t.priority === "high" ? "bg-destructive" : t.priority === "low" ? "bg-muted-foreground/50" : "bg-warning",
                        )}
                      />
                      <span className="flex-1">{t.title}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.priority}</span>
                    </div>
                  ))}
                </div>
              </div>

              <ReviewList icon={Sparkles} title="How to use your CRM" items={profile.crmSetupTips} />
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "welcome" && step !== "research" && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={() => {
                if (step === "business") setStep("welcome");
                else if (step === "domain") setStep("business");
                else if (step === "socials") setStep("domain");
                else if (step === "review") setStep("socials");
              }}
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>

            {step === "business" && (
              <Button className="rounded-full px-5" disabled={!canContinueBusiness} onClick={() => setStep("domain")}>
                Continue <ArrowRight data-icon="inline-end" />
              </Button>
            )}
            {step === "domain" && (
              <Button className="rounded-full px-5" disabled={!canContinueDomain} onClick={() => setStep("socials")}>
                Continue <ArrowRight data-icon="inline-end" />
              </Button>
            )}
            {step === "socials" && (
              <Button className="rounded-full px-5" onClick={() => setStep("research")}>
                Research my business <Sparkles data-icon="inline-end" />
              </Button>
            )}
            {step === "review" && (
              <Button
                className="rounded-full px-5"
                disabled={saving}
                onClick={() => void finishOnboarding()}
              >
                {saving ? <Spinner className="size-4" /> : null}
                Enter workspace <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" />
      {title}
    </p>
  );
}

function ReviewList({
  icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <SectionTitle icon={icon} title={title} />
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="max-w-full rounded-lg border border-border bg-muted/20 px-2.5 py-1 text-xs break-words text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
