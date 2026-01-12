export type ProfileBadgeTone = "default" | "primary";

export type ProfileBadge = {
  label: string;
  tone: ProfileBadgeTone;
};

export type ProfileStat = {
  label: string;
  value: string;
  tone?: ProfileBadgeTone;
};

export type ProfileSummary = {
  name: string;
  handle: string;
  avatarUrl?: string;
  avatarFallback: string;
  badges: ProfileBadge[];
  stats: ProfileStat[];
};
