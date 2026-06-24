import { AvatarGroup } from "@/components/ui/avatar";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";
import type { TeamMember } from "@/types";

interface TeamAvatarStripProps {
  members: TeamMember[];
}

export function TeamAvatarStrip({ members }: TeamAvatarStripProps) {
  const {
    memberFilterId,
    selectedMemberId,
    setMemberFilter,
    selectMember,
  } = useSelectionStore();

  const handleMemberClick = (member: TeamMember) => {
    if (memberFilterId === member.id) {
      setMemberFilter(null);
      selectMember(null);
      return;
    }
    selectMember(member);
    setMemberFilter(member.id);
  };

  const handleAllClick = () => {
    setMemberFilter(null);
    selectMember(null);
  };

  if (members.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="shrink-0 text-sm font-medium text-muted-foreground">
        Team
      </span>
      <TooltipProvider delay={200}>
        <AvatarGroup>
          {members.map((member) => {
            const isActive =
              memberFilterId === member.id || selectedMemberId === member.id;

            return (
              <Tooltip key={member.id}>
                <TooltipTrigger
                  className={cn(
                    "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  onClick={() => handleMemberClick(member)}
                >
                  <PersonAvatar
                    name={member.name}
                    avatarUrl={member.avatarUrl}
                    status={member.status}
                    shape="square"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {member.name} · {member.role}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </AvatarGroup>
      </TooltipProvider>
      {memberFilterId && (
        <Button variant="ghost" size="sm" onClick={handleAllClick}>
          Show all
        </Button>
      )}
    </div>
  );
}
