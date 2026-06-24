import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { currentUser } from "@/lib/current-user";
import { presenceLabels } from "@/lib/avatars";
import { useShellStore } from "@/stores/shell-store";

export function ProfileSheet() {
  const profileOpen = useShellStore((s) => s.profileOpen);
  const setProfileOpen = useShellStore((s) => s.setProfileOpen);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);

  return (
    <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Profile</SheetTitle>
          <SheetDescription>
            Your workspace identity and account details.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <div className="flex items-start gap-4">
            <PersonAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
              status={currentUser.status}
              size="lg"
              shape="square"
              imageSize={128}
              className="size-16"
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-medium">{currentUser.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{currentUser.role}</p>
              <Badge variant="secondary" className="mt-2">
                {presenceLabels[currentUser.status]}
              </Badge>
            </div>
          </div>

          {currentUser.bio ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{currentUser.bio}</p>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Email
              </p>
              <p className="text-sm">{currentUser.email}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Workspace
              </p>
              <p className="text-sm">{currentUser.workspace}</p>
            </div>
          </div>

          <Separator />

          <Button
            variant="outline"
            className="justify-between"
            onClick={() => {
              setProfileOpen(false);
              setSettingsOpen(true);
            }}
          >
            Account settings
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
