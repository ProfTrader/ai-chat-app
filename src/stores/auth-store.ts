import { create } from "zustand";
import {
  connectCursorApiKey,
  fetchAuthStatus,
  fetchCursorModels,
  logoutAuth,
  startCursorAuth,
  updateCursorModel,
  type AuthStatus,
  type CursorModel,
} from "@/lib/auth/client";

interface AuthState {
  status: AuthStatus | null;
  models: CursorModel[];
  loading: boolean;
  connecting: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  beginCursorSignIn: () => Promise<string>;
  connectWithApiKey: (apiKey: string) => Promise<void>;
  disconnect: () => Promise<void>;
  loadModels: () => Promise<void>;
  setModel: (model: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: null,
  models: [],
  loading: true,
  connecting: false,
  error: null,

  refreshStatus: async () => {
    set({ loading: true, error: null });
    try {
      const status = await fetchAuthStatus();
      set({ status, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load auth status",
      });
    }
  },

  beginCursorSignIn: async () => {
    set({ connecting: true, error: null });
    try {
      const result = await startCursorAuth();
      window.open(result.authUrl, "_blank", "noopener,noreferrer");
      set({ connecting: true });
      return result.instructions;
    } catch (error) {
      set({
        connecting: false,
        error: error instanceof Error ? error.message : "Failed to start sign-in",
      });
      throw error;
    }
  },

  connectWithApiKey: async (apiKey: string) => {
    set({ connecting: true, error: null });
    try {
      const status = await connectCursorApiKey(apiKey.trim());
      set({ status, connecting: false });
      await get().loadModels();
    } catch (error) {
      set({
        connecting: false,
        error: error instanceof Error ? error.message : "Invalid Moonshot API key",
      });
      throw error;
    }
  },

  disconnect: async () => {
    await logoutAuth();
    set({ status: null, models: [], error: null });
    await get().refreshStatus();
  },

  loadModels: async () => {
    try {
      const models = await fetchCursorModels();
      set({ models });
    } catch {
      const current = get().status?.model;
      if (current) {
        set({ models: [{ id: current, name: current }] });
      }
    }
  },

  setModel: async (model: string) => {
    await updateCursorModel(model);
    const status = get().status;
    if (status) {
      set({ status: { ...status, model } });
    }
  },
}));
