import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShellStore } from "@/stores/shell-store";

const shortcuts = [
  { keys: "Ctrl + K", action: "Open command palette" },
  { keys: "Ctrl + N", action: "New session" },
  { keys: "Ctrl + 1", action: "Go to Chat" },
  { keys: "Ctrl + 2", action: "Go to Tasks" },
  { keys: "Ctrl + 3", action: "Go to Board" },
  { keys: "Ctrl + 4", action: "Go to Contacts" },
  { keys: "Ctrl + B", action: "Toggle navigation sidebar" },
  { keys: "Ctrl + I", action: "Toggle inspector panel" },
  { keys: "?", action: "Show keyboard shortcuts" },
];

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useShellStore();

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {shortcuts.map(({ keys, action }) => (
            <div
              key={keys}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="text-muted-foreground">{action}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
