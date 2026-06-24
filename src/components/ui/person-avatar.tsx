import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { avatarImageUrl, presenceBadgeClass } from "@/lib/avatars";
import { getInitials } from "@/lib/team-utils";
import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/types";

interface PersonAvatarProps {
  name: string;
  avatarUrl?: string;
  status?: PresenceStatus;
  size?: "default" | "sm" | "lg";
  shape?: "circle" | "square";
  imageSize?: number;
  className?: string;
  alt?: string;
}

export function PersonAvatar({
  name,
  avatarUrl,
  status,
  size = "default",
  shape = "circle",
  imageSize = 96,
  className,
  alt,
}: PersonAvatarProps) {
  const roundedClass = shape === "square" ? "rounded-md" : "rounded-full";
  const src = avatarUrl ? avatarImageUrl(avatarUrl, imageSize) : undefined;

  return (
    <Avatar
      size={size}
      className={cn("relative", roundedClass, className)}
    >
      {src ? (
        <AvatarImage
          src={src}
          alt={alt ?? name}
          className={roundedClass}
        />
      ) : null}
      <AvatarFallback className={roundedClass}>{getInitials(name)}</AvatarFallback>
      {status ? (
        <AvatarBadge className={presenceBadgeClass[status]} />
      ) : null}
    </Avatar>
  );
}
