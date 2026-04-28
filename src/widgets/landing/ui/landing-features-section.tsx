import Link from "next/link";
import { AudioLines, Clapperboard, Images, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";

const studioLanes = [
  { key: "image", href: "/image", icon: Images },
  { key: "video", href: "/video", icon: Clapperboard },
  { key: "audio", href: "/audio", icon: AudioLines },
] as const;

export function LandingFeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
      <div className="max-w-xl">
        <p className="text-xs font-mono text-primary">{t("eyebrow")}</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          {t("title")}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-gray-400">
          {t("description")}
        </p>
      </div>

      <div className="grid gap-4">
        {studioLanes.map((lane, index) => {
          const Icon = lane.icon;
          return (
            <Link
              key={lane.key}
              href={lane.href}
              className="group grid gap-4 rounded-2xl border border-white/10 bg-surface-dark/70 p-5 transition-colors hover:border-primary/40 hover:bg-surface-lighter/70 sm:grid-cols-[96px_1fr_auto] sm:items-center"
            >
              <div className="flex h-20 items-center justify-center rounded-xl bg-creative-surface-muted text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-mono text-gray-500">
                  0{index + 1}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {t(`lanes.${lane.key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {t(`lanes.${lane.key}.description`)}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                {t("laneCta")}
                <WandSparkles className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
