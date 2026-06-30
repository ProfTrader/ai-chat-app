import { ChatComposer } from "@/components/composer/chat-composer";
import { EmptyState } from "@/components/workspace/empty-state";
import { ChatThread } from "@/components/workspace/chat-thread";
import { InboxWorkspace } from "@/components/workspace/inbox-workspace";
import { ChatSessionProvider } from "@/lib/chat/chat-session-provider";
import type { SidebarMode } from "@/stores/shell-store";

export function ChatWorkspace({
  sessionId,
  sidebarMode,
}: {
  sessionId: string | null;
  sidebarMode: SidebarMode;
}) {
  if (sidebarMode === "inbox") return <InboxWorkspace />;

  return (
    <ChatSessionProvider sessionId={sessionId}>
      {sessionId ? <ChatThread /> : <EmptyState />}
      <ChatComposer />
    </ChatSessionProvider>
  );
}
