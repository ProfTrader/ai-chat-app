import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BusinessProfile, OnboardingAnswers } from "@/lib/onboarding/client";

interface OnboardingState {
  completed: boolean;
  answers: OnboardingAnswers | null;
  profile: BusinessProfile | null;
  researchedAt: string | null;
  complete: (answers: OnboardingAnswers, profile: BusinessProfile) => void;
  skip: () => void;
  /** Re-open onboarding while keeping existing answers/profile for prefill. */
  restart: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      answers: null,
      profile: null,
      researchedAt: null,
      complete: (answers, profile) =>
        set({
          completed: true,
          answers,
          profile,
          researchedAt: new Date().toISOString(),
        }),
      skip: () => set({ completed: true }),
      restart: () => set({ completed: false }),
      reset: () =>
        set({ completed: false, answers: null, profile: null, researchedAt: null }),
    }),
    {
      name: "crm-onboarding",
    },
  ),
);
