"use client";

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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-surface-dark px-6 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:border-white hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_15px_rgba(212,240,50,0.2)] transition-all hover:bg-primary-dark"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 sm:px-10">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="xl:col-span-4 flex flex-col gap-6">
            <div className="rounded-2xl border border-white/10 bg-surface-dark p-8">
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-full border-4 border-surface-dark bg-surface-lighter text-primary">
                  <span className="text-2xl font-bold">LF</span>
                </div>
                <h2 className="mb-1 text-2xl font-bold text-white">Alex Designer</h2>
                <p className="mb-4 text-sm font-mono text-primary">@alex_creates</p>
                <div className="mb-6 flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-300">
                    Creator
                  </span>
                  <span className="rounded-full border border-primary/20 bg-primary/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                    Pro Member
                  </span>
                </div>
                <div className="my-2 h-px w-full bg-white/5" />
                <div className="mt-4 grid w-full grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-surface-lighter p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Generations
                    </span>
                    <span className="text-xl font-mono font-bold text-white">1,204</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-surface-lighter p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Credits
                    </span>
                    <span className="text-xl font-mono font-bold text-primary">450</span>
                  </div>
                </div>
              </div>
            </div>
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
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-dark">
              <div className="flex items-center justify-between border-b border-white/5 px-8 py-6">
                <h3 className="flex items-center gap-3 text-lg font-bold text-white">
                  <span className="h-6 w-1 rounded-full bg-primary" />
                  Personal Information
                </h3>
              </div>
              <div className="p-8">
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                      First Name
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value="Alex"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                      Last Name
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value="Designer"
                    />
                  </div>
                </div>
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                      Email Address
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value="alex@example.com"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                      Username
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value="alex_creates"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                    Bio
                  </label>
                  <textarea
                    rows={4}
                    className="w-full resize-none rounded-lg border border-white/10 bg-surface-lighter px-4 py-3 text-sm font-mono text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    defaultValue="Digital artist exploring the boundaries of AI generation."
                  />
                  <div className="mt-2 flex justify-end">
                    <span className="text-[10px] font-mono text-gray-600">82/200 CHARACTERS</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface-dark p-6">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-white">
                Notifications
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Generation Complete</span>
                <div className="relative h-6 w-10 cursor-not-allowed rounded-full border border-white/10 bg-surface-lighter opacity-60">
                  <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-gray-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
