import { Cpu, Images, RefreshCcw, Sparkles, WandSparkles, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { FeatureCard } from "@/shared/ui/grid-feature-cards";

const featureKeys = [
  { key: "prompt", icon: Sparkles },
  { key: "image", icon: Images },
  { key: "motion", icon: WandSparkles },
  { key: "audio", icon: Workflow },
  { key: "reuse", icon: RefreshCcw },
  { key: "models", icon: Cpu },
] as const;

export function LandingCoreFeaturesSection() {
  const t = useTranslations("landing.coreFeatures");

  return (
    <section className="px-6 pt-16 sm:px-10 lg:pt-24">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black uppercase tracking-normal text-white md:text-5xl">
            {t("title")}
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 divide-y divide-dashed divide-white/10 overflow-hidden rounded-[1.8rem] border border-dashed border-white/15 bg-[#0b0f12] sm:grid-cols-2 sm:divide-x md:grid-cols-3">
          {featureKeys.map((item, index) => (
            <FeatureCard
              key={item.key}
              feature={{
                title: t(`items.${item.key}.title`),
                description: t(`items.${item.key}.description`),
                icon: item.icon,
              }}
              patternSeed={index}
              className="min-h-52"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
