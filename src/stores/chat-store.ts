import { create } from "zustand";
import type { ComposerMode } from "@/types";

interface ChatState {
  composerText: string;
  composerMode: ComposerMode;
  setComposerText: (text: string) => void;
  setComposerMode: (mode: ComposerMode) => void;
  resetComposer: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  composerText: "",
  composerMode: "auto",
  setComposerText: (composerText) => set({ composerText }),
  setComposerMode: (composerMode) => set({ composerMode }),
  resetComposer: () => set({ composerText: "" }),
}));
