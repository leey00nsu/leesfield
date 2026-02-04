import { Boxes, History, Images, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";

const featureCards = [
  { key: "generation", icon: Images },
  { key: "history", icon: History },
  { key: "model", icon: Boxes },
  { key: "api", icon: Terminal },
];

export function LandingFeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <>
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
          {t("title")}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {featureCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="group rounded-2xl border border-white/5 bg-surface-dark p-6 transition-all duration-300 hover:border-primary/50 hover:bg-surface-lighter"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">
                {t(`cards.${card.key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-gray-400">
                {t(`cards.${card.key}.description`)}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
