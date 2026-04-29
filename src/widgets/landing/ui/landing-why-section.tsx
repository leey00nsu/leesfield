import { Archive, Eye, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export function LandingWhySection() {
  const t = useTranslations("landing.why");
  const cards = [
    { key: "look", icon: Eye },
    { key: "reuse", icon: Archive },
    { key: "private", icon: LockKeyhole },
    { key: "momentum", icon: Sparkles },
  ] as const;

  return (
    <section className="px-6 sm:px-10">
      <div className="mx-auto grid w-full max-w-[1600px] gap-10 border-y border-white/10 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-5 max-w-2xl text-4xl font-black uppercase leading-none text-white sm:text-6xl">
            {t("title")}
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            {t("description")}
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-3xl font-black text-white">{t("proof.left.value")}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
                {t("proof.left.label")}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-3xl font-black text-white">{t("proof.right.value")}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
                {t("proof.right.label")}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#111517] p-7 transition-all hover:-translate-y-1 hover:border-primary/45"
              >
                <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-colors group-hover:bg-primary/10" />
                <div className="relative z-10">
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-black/50 text-primary shadow-[0_0_15px_rgba(212,240,50,0.12)]">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-black text-white">
                    {t(`cards.${card.key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-400">
                    {t(`cards.${card.key}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
