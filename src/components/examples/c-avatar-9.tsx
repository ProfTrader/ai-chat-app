import { PersonAvatar } from "@/components/ui/person-avatar";
import { unsplashAvatars } from "@/lib/avatars";

export function Pattern() {
  return (
    <div className="flex items-center gap-2">
      <PersonAvatar
        name="Alex Johnson"
        avatarUrl={unsplashAvatars.alex}
        status="online"
        shape="square"
      />
      <PersonAvatar
        name="Sarah Chen"
        avatarUrl={unsplashAvatars.sarah}
        status="away"
        shape="square"
      />
      <PersonAvatar
        name="Michael Rodriguez"
        avatarUrl={unsplashAvatars.jordan}
        status="busy"
        shape="square"
      />
      <PersonAvatar
        name="Emma Wilson"
        avatarUrl={unsplashAvatars.emma}
        status="offline"
        shape="square"
      />
    </div>
  );
}
