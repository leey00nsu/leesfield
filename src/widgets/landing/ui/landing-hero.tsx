import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  Code2,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

const generationTabs = ["image", "video", "audio"] as const;

const recentImages = [
  {
    src: "/assets/creative-studio/mirror-portrait.jpg",
    alt: "Portrait generation",
  },
  {
    src: "/assets/creative-studio/studio-vocalist.jpg",
    alt: "Studio generation",
  },
  {
    src: "/assets/creative-studio/film-production.jpg",
    alt: "Production generation",
  },
  {
    src: "/assets/creative-studio/audio-console.jpg",
    alt: "Audio generation",
  },
  {
    src: "/sample-image.png",
    alt: "Landscape generation",
  },
  {
    src: "/assets/creative-studio/blue-mosaic.jpg",
    alt: "Texture generation",
  },
];

const valueCards = [
  { key: "developer", icon: Code2 },
  { key: "production", icon: ShieldCheck },
  { key: "monitoring", icon: ChartNoAxesCombined },
] as const;

export function LandingHero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-8 sm:px-10 lg:pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.22_0.026_104_/_0.46),transparent_34rem)]" />
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col items-center">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="lf-motion-rise lf-serif text-[clamp(3.5rem,7vw,7.5rem)] leading-[0.92] text-white">
            {t("headline")}
          </h1>
          <p className="mt-7 text-lg text-white/68 md:text-2xl">
            {t("subhead")}
          </p>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="lf-editorial-panel relative mt-10 w-full max-w-5xl overflow-hidden rounded-[1.35rem] p-4"
        >
          <WarpShaderPanel className="absolute inset-0 opacity-80" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.12_0.008_104_/_0.55),oklch(0.08_0.006_104_/_0.88))]" />

          <div className="relative">
            <div className="grid grid-cols-3 border-b border-white/12 text-center text-base font-semibold text-white">
              {generationTabs.map((tab, index) => (
                <Link
                  key={tab}
                  href={`/${tab === "image" ? "image" : tab}`}
                  className="relative py-5 text-white/80 transition-colors hover:text-white"
                >
                  {t(`tabs.${tab}`)}
                  {index === 0 ? (
                    <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-full max-w-[15rem] bg-primary" />
                  ) : null}
                </Link>
              ))}
            </div>

            <label htmlFor="landing-prompt-preview" className="sr-only">
              {t("preview.promptLabel")}
            </label>
            <textarea
              id="landing-prompt-preview"
              readOnly
              aria-label={t("preview.promptLabel")}
              placeholder={t("preview.placeholder")}
              className="mt-1 h-32 w-full resize-none rounded-xl border border-white/12 bg-black/18 p-5 text-lg text-white outline-none placeholder:text-white/45"
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_0.65fr]">
              <Link
                href="/model"
                className="flex items-center justify-between rounded-xl border border-white/12 bg-black/16 px-5 py-4 text-left"
              >
                <span>
                  <span className="block text-sm text-white/46">
                    {t("preview.modelLabel")}
                  </span>
                  <span className="text-lg font-medium text-white">
                    {t("preview.model")}
                  </span>
                </span>
                <ChevronDown className="h-5 w-5 text-white/62" />
              </Link>
              <Link
                href="/image"
                className="flex items-center justify-between rounded-xl border border-white/12 bg-black/16 px-5 py-4 text-left"
              >
                <span>
                  <span className="block text-sm text-white/46">
                    {t("preview.aspectLabel")}
                  </span>
                  <span className="text-lg font-medium text-white">
                    {t("preview.aspect")}
                  </span>
                </span>
                <ChevronDown className="h-5 w-5 text-white/62" />
              </Link>
              <Button
                asChild
                variant="hero"
                className="h-full min-h-16 rounded-xl text-base normal-case tracking-normal"
              >
                <Link href="/image">
                  {t("preview.generate")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_0.46fr]">
          <div className="lf-editorial-card rounded-[1.35rem] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {t("recent.title")}
              </h2>
              <Link href="/history" className="text-sm font-semibold text-primary">
                {t("recent.cta")}
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
              {recentImages.map((image) => (
                <div
                  key={image.src}
                  className="relative aspect-[1.75] overflow-hidden rounded-lg bg-white/5"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 220px, 45vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {valueCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="lf-editorial-card flex items-start gap-5 rounded-[1.2rem] p-6"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-lg font-semibold text-white">
                      {t(`valueCards.${card.key}.title`)}
                    </span>
                    <span className="mt-1 block text-base leading-6 text-white/62">
                      {t(`valueCards.${card.key}.description`)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
