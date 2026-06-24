import { unsplashAvatars } from "@/lib/avatars";
import type { UserProfile } from "@/types";

export const currentUser: UserProfile = {
  id: "user-1",
  name: "Sudharshan Ramanathan",
  role: "Product Lead",
  email: "sudharshan@acme.co",
  workspace: "Acme Corp",
  bio: "Building Nexus CRM and coordinating the Q2 launch across design, engineering, and marketing.",
  avatarUrl: unsplashAvatars.you,
  status: "online",
};
