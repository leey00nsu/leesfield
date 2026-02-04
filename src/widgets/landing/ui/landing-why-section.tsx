import { Blocks, BookOpen, Gauge } from "lucide-react";
import { useTranslations } from "next-intl";

export function LandingWhySection() {
  const t = useTranslations("landing.why");
  const cards = [
    { key: "openapi", icon: BookOpen },
    { key: "adapters", icon: Blocks },
    { key: "dashboard", icon: Gauge },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
          {t("title")}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-b from-surface-lighter to-surface-dark p-8 transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(212,240,50,0.1)]"
            >
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-colors group-hover:bg-primary/10" />
              <div className="relative z-10">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg border border-primary/30 bg-black/50 text-primary shadow-[0_0_15px_rgba(212,240,50,0.15)]">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-xl font-bold tracking-tight text-white">
                  {t(`cards.${card.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {t(`cards.${card.key}.description`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
