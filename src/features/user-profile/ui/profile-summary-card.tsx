import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type {
  ProfileBadgeTone,
  ProfileSummary,
} from "@/features/user-profile/model/profile-types";

const statValueStyles: Record<ProfileBadgeTone, string> = {
  default: "text-white",
  primary: "text-primary",
};

interface ProfileSummaryCardProps {
  profile: ProfileSummary;
  onChangeAvatar?: () => void;
}

export function ProfileSummaryCard({
  profile,
  onChangeAvatar,
}: ProfileSummaryCardProps) {
  const tSummary = useTranslations("profile.summary");
  const canChangeAvatar = Boolean(onChangeAvatar);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface-dark p-8">
      <div className="absolute left-0 top-0 h-24 w-full bg-linear-to-b from-primary/10 to-transparent" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="relative mb-6">
          <div
            className={cn(
              "flex h-32 w-32 items-center justify-center rounded-full border-4 border-surface-dark",
              profile.avatarUrl ? "bg-cover bg-center" : "bg-surface-lighter"
            )}
            style={
              profile.avatarUrl
                ? { backgroundImage: `url(${profile.avatarUrl})` }
                : undefined
            }
          >
            {profile.avatarUrl ? null : (
              <span className="text-2xl font-bold text-primary">
                {profile.avatarFallback}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="default"
            size="icon"
            onClick={onChangeAvatar}
            disabled={!canChangeAvatar}
            className={cn(
              "absolute bottom-1 right-1 h-9 w-9 rounded-full bg-primary text-black shadow-lg transition-colors hover:bg-white",
              !canChangeAvatar && "opacity-70 hover:bg-primary"
            )}
            title={tSummary("changeAvatar")}
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="mb-1 text-2xl font-bold text-white">{profile.name}</h2>
        <p className="mb-4 text-sm font-mono text-primary">{profile.handle}</p>
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {profile.badges.map((badge) => (
            <Badge
              key={badge.label}
              variant={badge.tone === "primary" ? "primary" : "default"}
              size="md"
              className="px-3 py-1 tracking-widest"
            >
              {badge.label}
            </Badge>
          ))}
        </div>
        <div className="my-2 h-px w-full bg-white/5" />
        <div className="mt-4 grid w-full grid-cols-2 gap-4">
          {profile.stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-xl border border-white/5 bg-surface-lighter p-3"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {stat.label}
              </span>
              <span
                className={cn(
                  "text-xl font-mono font-bold",
                  statValueStyles[stat.tone ?? "default"]
                )}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
