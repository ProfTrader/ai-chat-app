export interface OnboardingAnswers {
  businessName: string;
  description: string;
  domain: string;
  goals: string;
  socials: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    other?: string;
  };
}

export interface BusinessProfile {
  summary: string;
  industry: string;
  businessModel: string;
  targetCustomers: string[];
  valueProposition: string;
  competitors: string[];
  opportunities: string[];
  suggestedProjects: { name: string; description: string }[];
  suggestedTasks: { title: string; priority: "high" | "medium" | "low" }[];
  crmSetupTips: string[];
}

export interface ResearchResponse {
  provider: string;
  model: string;
  profile: BusinessProfile;
}

export async function researchBusiness(answers: OnboardingAnswers): Promise<ResearchResponse> {
  const response = await fetch("/api/onboarding/research", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answers),
  });

  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Research failed"), { code: data.code });
  }
  return data as ResearchResponse;
}

/** Persist the firm profile server-side as the durable "soul of the firm". */
export async function saveFirmProfile(
  answers: OnboardingAnswers,
  profile: BusinessProfile,
  meta?: { provider?: string; model?: string },
): Promise<void> {
  const response = await fetch("/api/onboarding/profile", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, profile, ...meta }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.message ?? "Failed to save firm profile"), { code: data.code });
  }
}

/** URL of the rendered firm-profile document. */
export const firmProfileHtmlUrl = "/api/onboarding/profile.html";

