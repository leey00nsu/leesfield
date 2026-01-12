"use client";

import type {
  ProfileStat,
  ProfileSummary,
} from "@/features/user-profile/model/profile-types";
import { useProfileMetrics } from "@/features/user-profile/model/use-profile-metrics";
import { NotificationPanel } from "@/features/user-profile/ui/notification-panel";
import { ProfileHeaderActions } from "@/features/user-profile/ui/profile-header-actions";
import {
  ProfileForm,
  type ProfileFormValues,
} from "@/features/user-profile/ui/profile-form";
import { ProfileSummaryCard } from "@/features/user-profile/ui/profile-summary-card";
import { SubscriptionCard } from "@/features/user-profile/ui/subscription-card";

const numberFormatter = new Intl.NumberFormat("en-US");

type UserProfileWidgetProps = {
  adminEmail: string;
};

export function UserProfileWidget({ adminEmail }: UserProfileWidgetProps) {
  const { generationTotal } = useProfileMetrics();
  const username = adminEmail.split("@")[0] || "admin";
  const displayName = adminEmail || "Admin";
  const avatarFallback = username.slice(0, 2).toUpperCase() || "LF";
  const generationLabel =
    generationTotal === null ? "--" : numberFormatter.format(generationTotal);

  const profileStats: ProfileStat[] = [
    { label: "Generations", value: generationLabel },
    { label: "Credits", value: "--", tone: "primary" },
  ];

  const profileSummary: ProfileSummary = {
    name: displayName,
    handle: `@${username}`,
    avatarFallback,
    badges: [
      { label: "Creator", tone: "default" },
      { label: "Pro Member", tone: "primary" },
    ],
    stats: profileStats,
  };

  const profileFormValues: ProfileFormValues = {
    firstName: "",
    lastName: "",
    email: adminEmail,
    username,
    bio: "",
    bioMax: 200,
  };

  const profileFormPlaceholders = {
    firstName: "Not set",
    lastName: "Not set",
    email: "admin@example.com",
    username: "admin",
    bio: "Tell us about yourself...",
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                <span className="text-white">User</span>{" "}
                <span className="text-primary">Profile</span>
              </h1>
              <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                MANAGE YOUR PROFILE DETAILS
              </p>
            </div>
            <ProfileHeaderActions />
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 sm:px-10">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="xl:col-span-4 flex flex-col gap-6">
            <ProfileSummaryCard profile={profileSummary} />
            <SubscriptionCard />
          </div>
          <div className="xl:col-span-8 flex flex-col gap-6">
            <ProfileForm
              values={profileFormValues}
              placeholders={profileFormPlaceholders}
            />
            <NotificationPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
