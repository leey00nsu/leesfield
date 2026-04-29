import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

const generationTabs = ["image", "video", "audio"] as const;

export function LandingHero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-8 sm:px-10 lg:pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.22_0.026_104_/_0.46),transparent_34rem)]" />
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col items-center">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="lf-motion-rise lf-serif text-[clamp(2.5rem,4.8vw,4.9rem)] leading-[0.96] text-white">
            {t("headline")}
          </h1>
          <p className="mt-6 text-base leading-7 text-white/68 md:text-xl">
            {t("subhead")}
          </p>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative mt-9 w-full max-w-5xl overflow-hidden rounded-[1.35rem] p-3"
        >
          <div data-layer="hero-shader" className="absolute inset-0">
            <WarpShaderPanel className="absolute inset-0 opacity-80" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.12_0.008_104_/_0.28),oklch(0.08_0.006_104_/_0.74))]" />

          <div
            data-testid="landing-hero-form-surface"
            className="lf-editorial-panel relative overflow-hidden rounded-[1.05rem] p-4"
          >
            <div className="grid grid-cols-3 border-b border-white/12 text-center text-sm font-medium text-white">
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
              className="mt-1 h-28 w-full resize-none rounded-xl border border-white/12 bg-black/18 p-5 text-base leading-7 text-white outline-none placeholder:text-white/45"
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
                  <span className="text-sm font-medium text-white">
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
                  <span className="text-sm font-medium text-white">
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
      </div>
    </section>
  );
}
