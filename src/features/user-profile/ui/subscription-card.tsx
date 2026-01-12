export function SubscriptionCard() {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-dark p-6">
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
    </section>
  );
}
