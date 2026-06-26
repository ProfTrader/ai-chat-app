import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { useDataStore } from "@/stores/data-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { Message } from "@/types";

function messageToUi(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

function uiMessageToText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

interface ChatSessionContextValue {
  messages: UIMessage[];
  status: ReturnType<typeof useChat>["status"];
  error: Error | undefined;
  activities: ChatActivity[];
  send: (text: string) => Promise<void>;
  stop: () => void;
}

export interface ChatActivity {
  id: string;
  status: "running" | "complete" | "error";
  label: string;
  detail: string;
  toolName: string;
  provider?: string;
  model?: string;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

function normalizeActivity(part: { id?: string; data?: unknown }): ChatActivity {
  const data =
    part.data && typeof part.data === "object"
      ? (part.data as Record<string, unknown>)
      : {};

  return {
    id: part.id ?? `${Date.now()}`,
    status:
      data.status === "complete" || data.status === "error" || data.status === "running"
        ? data.status
        : "running",
    label: typeof data.label === "string" ? data.label : "Agent activity",
    detail: typeof data.detail === "string" ? data.detail : "",
    toolName: typeof data.toolName === "string" ? data.toolName : "runtime",
    provider: typeof data.provider === "string" ? data.provider : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
  };
}

export function ChatSessionProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  const getMessagesBySession = useDataStore((s) => s.getMessagesBySession);
  const persistChatMessage = useDataStore((s) => s.persistChatMessage);
  const updateSessionTitle = useDataStore((s) => s.updateSessionTitle);
  const createWorkRunFromPrompt = useDataStore((s) => s.createWorkRunFromPrompt);
  const { projects, workspaces, getTasksByProject } = useDataStore();
  const { projectId, contextChips } = useSelectionStore();
  const { composerMode } = useChatStore();
  const { status: authStatus } = useAuthStore();
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const [activities, setActivities] = useState<ChatActivity[]>([]);

  const project = projects.find((p) => p.id === projectId);
  const workspace = workspaces.find((w) => w.id === project?.workspaceId);

  const initialMessages = useMemo(() => {
    if (!sessionId) return [];
    return getMessagesBySession(sessionId).map(messageToUi);
  }, [getMessagesBySession, sessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages,
            sessionId,
            projectId,
            projectName: project?.name,
            projectSlug: project?.slug,
            workspaceName: workspace?.name,
            composerMode,
            contextChips,
            model: authStatus?.model,
            tasksSummary: projectId
              ? getTasksByProject(projectId).slice(0, 8).map((task) => ({
                  identifier: task.identifier,
                  title: task.title,
                  status: task.status,
                }))
              : [],
          },
        }),
      }),
    [
      authStatus?.model,
      composerMode,
      contextChips,
      getTasksByProject,
      project?.name,
      project?.slug,
      projectId,
      sessionId,
      workspace?.name,
    ],
  );

  const chat = useChat({
    id: sessionId ?? "empty-session",
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type !== "data-activity") return;
      const activity = normalizeActivity(part);
      setActivities((current) => [
        ...current.filter((item) => item.id !== activity.id),
        activity,
      ]);
    },
    onError: (error) => {
      const code = (error as Error & { code?: string }).code;
      if (code === "AUTH_REQUIRED") {
        toast.error("Connect Cursor to start chatting.");
        setSettingsOpen(true);
        return;
      }
      toast.error(error.message || "Failed to send message.");
    },
    onFinish: ({ message }) => {
      if (!sessionId || message.role !== "assistant") return;
      const content = uiMessageToText(message);
      void persistChatMessage(sessionId, content, "assistant", message.id);
    },
  });

  useEffect(() => {
    if (!sessionId) {
      chat.setMessages([]);
      setActivities([]);
      return;
    }
    chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
    setActivities([]);
  }, [sessionId]);

  const send = async (text: string) => {
    if (!sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    if (!authStatus?.connected) {
      toast.warning("Connect Cursor to start chatting.");
      setSettingsOpen(true);
      return;
    }

    setActivities([]);
    await persistChatMessage(sessionId, text, "user");
    if (composerMode === "plan") {
      await createWorkRunFromPrompt(text, projectId ?? undefined);
      toast.success("Plan artifact created in Briefs.");
    }

    const sessionMessages = getMessagesBySession(sessionId);
    if (sessionMessages.filter((m) => m.role === "user").length === 1) {
      void updateSessionTitle(sessionId, text);
    }

    await chat.sendMessage({ text });
  };

  const value: ChatSessionContextValue = {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    activities,
    send,
    stop: chat.stop,
  };

  return (
    <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return context;
}
