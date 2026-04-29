import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

const generationTabs = ["image", "video", "audio"] as const;

function TextGenerateLine({
  text,
  startIndex = 0,
}: {
  text: string;
  startIndex?: number;
}) {
  const words = text.split(" ");

  return (
    <span className="block whitespace-normal sm:whitespace-nowrap">
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="lf-text-generate-word"
          style={{ "--word-index": startIndex + index } as CSSProperties}
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : null}
        </span>
      ))}
    </span>
  );
}

export function LandingHero() {
  const t = useTranslations("landing.hero");
  const headlineFirst = t("headlineFirst");
  const headlineSecond = t("headlineSecond");
  const fullHeadline = `${headlineFirst} ${headlineSecond}`;

  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-8 sm:px-10 lg:pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.22_0.026_104_/_0.46),transparent_34rem)]" />
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col items-center">
        <div className="mx-auto max-w-6xl text-center">
          <h1
            aria-label={fullHeadline}
            className="lf-serif text-[clamp(2.15rem,3.55vw,3.85rem)] leading-[0.98] text-white"
          >
            <span aria-hidden="true">
              <TextGenerateLine text={headlineFirst} />
              <TextGenerateLine
                text={headlineSecond}
                startIndex={headlineFirst.split(" ").length}
              />
            </span>
          </h1>
          <p className="mt-6 text-base leading-7 text-white/68 md:text-xl">
            {t("subhead")}
          </p>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative mt-10 w-full max-w-6xl overflow-hidden rounded-[1.5rem] p-6 sm:p-8 lg:p-10"
        >
          <div data-layer="hero-shader" className="lf-shader-fade-in absolute inset-0">
            <WarpShaderPanel className="absolute inset-0 opacity-75" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.12_0.008_104_/_0.18),oklch(0.08_0.006_104_/_0.62))]" />

          <div
            data-testid="landing-hero-form-surface"
            className="lf-editorial-panel relative mx-auto max-w-4xl overflow-hidden rounded-[1.05rem] p-3 sm:p-4"
          >
            <div className="grid grid-cols-3 border-b border-white/12 text-center text-sm font-medium text-white">
              {generationTabs.map((tab, index) => (
                <Link
                  key={tab}
                  href={`/${tab === "image" ? "image" : tab}`}
                  className="relative py-4 text-white/80 transition-colors hover:text-white"
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
              className="mt-1 h-24 w-full resize-none rounded-xl border border-white/12 bg-black/18 p-4 text-sm leading-6 text-white outline-none placeholder:text-white/45"
            />

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_0.62fr]">
              <Link
                href="/model"
                className="flex items-center justify-between rounded-xl border border-white/12 bg-black/16 px-4 py-3 text-left"
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
                className="flex items-center justify-between rounded-xl border border-white/12 bg-black/16 px-4 py-3 text-left"
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
                className="h-full min-h-14 rounded-xl text-sm normal-case tracking-normal"
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
