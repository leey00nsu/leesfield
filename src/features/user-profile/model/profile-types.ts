export type ProfileBadgeTone = "default" | "primary";

export interface ProfileBadge {
  label: string;
  tone: ProfileBadgeTone;
}

export interface ProfileStat {
  label: string;
  value: string;
  tone?: ProfileBadgeTone;
}

export interface ProfileSummary {
  name: string;
  handle: string;
  avatarUrl?: string;
  avatarFallback: string;
  badges: ProfileBadge[];
  stats: ProfileStat[];
}
