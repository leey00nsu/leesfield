"use client";

import type { ProfileSummary } from "@/features/user-profile/model/profile-types";
import { NotificationPanel } from "@/features/user-profile/ui/notification-panel";
import { ProfileHeaderActions } from "@/features/user-profile/ui/profile-header-actions";
import {
  ProfileForm,
  type ProfileFormValues,
} from "@/features/user-profile/ui/profile-form";
import { ProfileSummaryCard } from "@/features/user-profile/ui/profile-summary-card";

const profileSummary: ProfileSummary = {
  name: "Alex Designer",
  handle: "@alex_creates",
  avatarFallback: "LF",
  badges: [
    { label: "Creator", tone: "default" },
    { label: "Pro Member", tone: "primary" },
  ],
  stats: [
    { label: "Generations", value: "1,204" },
    { label: "Credits", value: "450", tone: "primary" },
  ],
};

const profileFormValues: ProfileFormValues = {
  firstName: "Alex",
  lastName: "Designer",
  email: "alex@example.com",
  username: "alex_creates",
  bio: "Digital artist exploring the boundaries of AI generation. Based in Neo-Tokyo.",
  bioMax: 200,
};

export function UserProfileWidget() {
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
                IDENTITY VERIFIED // ACCOUNT MANAGEMENT
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
            <div className="rounded-2xl border border-white/10 bg-surface-dark p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                  <span className="text-primary">◆</span>
                  Subscription
                </h3>
                <button className="text-xs font-bold uppercase tracking-wide text-primary hover:underline">
                  Manage
                </button>
              </div>
              <div className="mb-4 rounded-xl border border-primary/20 bg-surface-lighter p-5">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">Pro Plan</p>
                    <p className="text-xs text-gray-400">$29/month</p>
                  </div>
                  <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                    Active
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                  <div className="h-full w-[65%] bg-primary" />
                </div>
                <p className="mt-2 text-right text-[10px] font-mono text-gray-400">
                  RENEWS IN 12 DAYS
                </p>
              </div>
              <button className="w-full rounded-lg border border-white/10 py-3 text-sm font-bold uppercase tracking-wide text-gray-300 transition-colors hover:bg-white/5">
                Upgrade Plan
              </button>
            </div>
          </div>
          <div className="xl:col-span-8 flex flex-col gap-6">
            <ProfileForm values={profileFormValues} />
            <NotificationPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
