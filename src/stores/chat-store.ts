import { create } from "zustand";
import type { ComposerMode } from "@/types";

export interface ComposerAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "text" | "file";
  /** Object URL for image previews. */
  previewUrl?: string;
  /** Extracted text content for text-like files (sent to the agent). */
  text?: string;
}

interface ChatState {
  composerText: string;
  composerMode: ComposerMode;
  attachments: ComposerAttachment[];
  setComposerText: (text: string) => void;
  setComposerMode: (mode: ComposerMode) => void;
  addAttachment: (attachment: ComposerAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  resetComposer: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  composerText: "",
  composerMode: "auto",
  attachments: [],
  setComposerText: (composerText) => set({ composerText }),
  setComposerMode: (composerMode) => set({ composerMode }),
  addAttachment: (attachment) =>
    set((state) => ({ attachments: [...state.attachments, attachment] })),
  removeAttachment: (id) =>
    set((state) => {
      const target = state.attachments.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return { attachments: state.attachments.filter((a) => a.id !== id) };
    }),
  clearAttachments: () =>
    set((state) => {
      state.attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return { attachments: [] };
    }),
  resetComposer: () =>
    set((state) => {
      state.attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return { composerText: "", attachments: [] };
    }),
}));
