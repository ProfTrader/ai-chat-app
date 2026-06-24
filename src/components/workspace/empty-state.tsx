import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";

export function EmptyState() {
  const { projectId } = useSelectionStore();
  const addSession = useDataStore((s) => s.addSession);
  const setSessionId = useSelectionStore((s) => s.setSessionId);
  const setActiveView = useShellStore((s) => s.setActiveView);

  const handleStart = async () => {
    if (!projectId) return;
    const session = await addSession(projectId);
    setSessionId(session.id);
    setActiveView("chat");
  };

  return (
    <div className="flex h-full items-center justify-center px-8 pb-32">
      <Empty className="max-w-lg border border-border bg-pane">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare />
          </EmptyMedia>
          <EmptyTitle>Nexus CRM</EmptyTitle>
          <EmptyDescription>
            Drop a task, contact, or rough idea. Track projects, manage relationships,
            and keep conversations in one quiet command center.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => void handleStart()} disabled={!projectId}>
            Start a conversation
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
