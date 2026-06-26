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

function messageContent(message: Message) {
  return message.content.toLowerCase();
}

function hasRecentBriefContext(messages: Message[]) {
  return messages
    .slice(-8)
    .some((message) =>
      /\b(brief|breif|research memo|memo|report|dossier|artifact|study|research findings)\b/.test(
        messageContent(message),
      ),
    );
}

function shouldRouteToBrief(text: string, previousMessages: Message[]) {
  const input = text.toLowerCase().replace(/\s+/g, " ").trim();
  const artifactIntent = /\b(brief|breif|research memo|memo|report|dossier|artifact|study|research findings)\b/.test(input);
  const createIntent = /\b(build|create|draft|make|generate|write|prepare|produce|turn|convert|give|compose|do)\b/.test(input) || /\bput together\b/.test(input);
  const analysisBriefIntent = /\b(analysis|analyze|research)\b/.test(input) && /\b(next|plan|recommend|what to do|summary)\b/.test(input);
  const bareBriefIntent = artifactIntent && /\b(general|overall|status|research|findings|next|it|that|this)\b/.test(input);
  const continuationIntent =
    hasRecentBriefContext(previousMessages) &&
    /\b(brief|breif|research|findings|general|overall|status|next|it|that|this|give me|do it|go ahead)\b/.test(input) &&
    !/^(what|why|when|where|who|how)\b/.test(input);

  return (artifactIntent && (createIntent || analysisBriefIntent || bareBriefIntent)) || continuationIntent;
}

function buildBriefPrompt(text: string, previousMessages: Message[], projectName?: string) {
  const recentUserContext = previousMessages
    .slice(-8)
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => `- ${message.content}`)
    .join("\n\n");

  if (!recentUserContext) return text;

  return `Create a structured brief for ${projectName ?? "the selected project"} using the latest request and recent user intent.

Latest request:
${text}

Recent user intent:
${recentUserContext}

Do not ask clarifying questions. Use available workspace evidence, cite what is known, and mark missing information as evidence gaps or assumptions.`;
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
  const updateMessageContent = useDataStore((s) => s.updateMessageContent);
  const updateSessionTitle = useDataStore((s) => s.updateSessionTitle);
  const createArtifactRunFromPromptStream = useDataStore((s) => s.createArtifactRunFromPromptStream);
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
    const previousMessages = getMessagesBySession(sessionId);
    await persistChatMessage(sessionId, text, "user");
    const shouldCreateBrief = composerMode === "plan" || shouldRouteToBrief(text, previousMessages);

    const sessionMessages = getMessagesBySession(sessionId);
    if (sessionMessages.filter((m) => m.role === "user").length === 1) {
      void updateSessionTitle(sessionId, text);
    }

    if (shouldCreateBrief) {
      const assistant = await persistChatMessage(
        sessionId,
        "Dexter is creating the HTML brief artifact...\n\n- Understanding request",
        "assistant",
      );
      chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));

      const progress: string[] = [];
      const renderProgress = (line: string) => {
        if (!progress.includes(line)) progress.push(line);
        const body = [
          "Dexter is creating the HTML brief artifact...",
          "",
          ...progress.map((item) => `- ${item}`),
        ].join("\n");
        void updateMessageContent(assistant.id, body).then(() => {
          chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
        });
      };

      try {
        const run = await createArtifactRunFromPromptStream(
          buildBriefPrompt(text, previousMessages, project?.name),
          projectId ?? undefined,
          (event) => {
            if (event.data.label) {
              renderProgress(event.data.detail ? `${event.data.label}: ${event.data.detail}` : event.data.label);
            }
          },
        );

        await updateMessageContent(
          assistant.id,
          [
            `Created **${run.title}**.`,
            "",
            "The HTML artifact is ready in Briefs with evidence, tables, charts, recommendations, and audit status.",
            "",
            `[[nexus:view-brief:${run.id}]]`,
          ].join("\n"),
        );
        chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
        toast.success("Brief artifact created.");
      } catch (error) {
        await updateMessageContent(
          assistant.id,
          `I could not create the brief artifact. ${error instanceof Error ? error.message : "The stream failed."}`,
        );
        chat.setMessages(getMessagesBySession(sessionId).map(messageToUi));
        toast.error("Brief creation failed.");
      }
      return;
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
