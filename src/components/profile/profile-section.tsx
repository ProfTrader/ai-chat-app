import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { currentUser } from "@/lib/current-user";
import { useShellStore } from "@/stores/shell-store";

export function ProfileSection() {
  const setProfileOpen = useShellStore((s) => s.setProfileOpen);

  return (
    <Button
      variant="ghost"
      className="h-auto min-w-0 flex-1 justify-start gap-2.5 px-2 py-2 font-normal"
      onClick={() => setProfileOpen(true)}
    >
      <PersonAvatar
        name={currentUser.name}
        avatarUrl={currentUser.avatarUrl}
        status={currentUser.status}
        size="sm"
        shape="square"
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{currentUser.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{currentUser.role}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}
