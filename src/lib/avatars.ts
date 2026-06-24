import type { PresenceStatus } from "@/types";

/** Unsplash portrait URLs sized for avatar display (from @reui/c-avatar-9). */
export const unsplashAvatars = {
  alex: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80",
  sarah: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=96&h=96&dpr=2&q=80",
  jordan: "https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=96&h=96&dpr=2&q=80",
  emma: "https://images.unsplash.com/photo-1485893086445-ed75865251e0?w=96&h=96&dpr=2&q=80",
  morgan: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&dpr=2&q=80",
  priya: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&dpr=2&q=80",
  chris: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&dpr=2&q=80",
  elena: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&dpr=2&q=80",
  you: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&h=96&dpr=2&q=80",
} as const;

export function avatarImageUrl(url: string, size = 96): string {
  if (url.includes("images.unsplash.com")) {
    const parsed = new URL(url);
    parsed.searchParams.set("w", String(size));
    parsed.searchParams.set("h", String(size));
    parsed.searchParams.set("dpr", "2");
    parsed.searchParams.set("q", "80");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("crop", "faces");
    return parsed.toString();
  }
  return url;
}

export const presenceLabels: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};

export const presenceBadgeClass: Record<PresenceStatus, string> = {
  online: "-top-1 -right-1 bg-success",
  away: "-right-1 -bottom-1 bg-warning",
  busy: "-top-1 -left-1 right-auto bottom-auto bg-destructive",
  offline: "-bottom-1 -left-1 right-auto bg-muted-foreground",
};
