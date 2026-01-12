import { cn } from "@/shared/lib/utils";

const disabledToggleBase =
  "relative h-6 w-10 rounded-full border border-white/10 bg-surface-lighter opacity-60";

export function NotificationPanel() {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-dark p-6">
      <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-white">
        Notifications
      </h3>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">Generation Complete</span>
        <div
          className={cn(disabledToggleBase, "cursor-not-allowed")}
          aria-disabled="true"
        >
          <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-gray-500" />
        </div>
      </div>
    </section>
  );
}
