import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { useTranslations } from "next-intl";

export function SubscriptionCard() {
  const t = useTranslations("profile.subscription");

  return (
    <section className="rounded-2xl border border-white/10 bg-surface-dark p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <span className="text-primary">◆</span>
          {t("title")}
        </h3>
        <AppButton
          type="button"
          variant="ghost"
          disabled
          className="h-auto p-0 text-xs font-bold uppercase tracking-wide text-primary disabled:opacity-50"
        >
          {t("manage")}
        </AppButton>
      </div>
      <div className="mb-4 rounded-xl border border-primary/20 bg-surface-lighter p-5">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-white">{t("plan")}</p>
            <p className="text-xs text-gray-400">{t("price")}</p>
          </div>
          <AppBadge variant="muted" className="bg-white/10 text-gray-300">
            {t("badge")}
          </AppBadge>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
          <div className="h-full w-[15%] bg-white/40" />
        </div>
        <p className="mt-2 text-right text-[10px] font-mono text-gray-400">
          {t("noRenewal")}
        </p>
      </div>
      <AppButton
        type="button"
        variant="surface"
        disabled
        className="w-full rounded-lg border-white/10 py-3 text-sm font-bold uppercase tracking-wide text-gray-300 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        {t("upgrade")}
      </AppButton>
    </section>
  );
}
