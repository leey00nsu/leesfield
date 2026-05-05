import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppHeading } from "@/shared/ui/app-typography";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";
import { LandingHeroMotionLayer } from "./landing-hero-form-motion";

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
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col items-center">
        <div className="mx-auto max-w-6xl text-center">
          <AppHeading
            as="h1"
            size="hero"
            aria-label={fullHeadline}
          >
            <span aria-hidden="true">
              <TextGenerateLine text={headlineFirst} />
              <TextGenerateLine
                text={headlineSecond}
                startIndex={headlineFirst.split(" ").length}
              />
            </span>
          </AppHeading>
          <p className="mt-6 text-base leading-7 text-white/68 md:text-xl">
            {t("subhead")}
          </p>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative mt-10 w-full max-w-6xl overflow-hidden rounded-[1.5rem] bg-[#07090a] p-6 sm:p-8 lg:p-10"
        >
          <LandingHeroMotionLayer
            testId="landing-hero-preview-border-motion"
            className="pointer-events-none absolute inset-0 rounded-[1.5rem] border border-white/10"
          />

          <LandingHeroMotionLayer
            data-layer="hero-form-shader"
            testId="landing-hero-shader-motion"
            className="absolute inset-0"
          >
            <WarpShaderPanel className="absolute inset-0" />
          </LandingHeroMotionLayer>

          <GenerationPromptField
            testId="landing-hero-form-surface"
            surface="hero"
            className="relative mx-auto max-w-4xl rounded-[1.05rem] border-0 p-3 sm:p-4"
            contentWrapper={(children) => (
              <>
                <LandingHeroMotionLayer
                  testId="landing-hero-form-border-motion"
                  className="pointer-events-none absolute inset-0 rounded-[1.05rem] border border-white/12"
                />
                <LandingHeroMotionLayer testId="landing-hero-form-motion">
                  {children}
                </LandingHeroMotionLayer>
              </>
            )}
            header={
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
            }
            textarea={
              <>
                <label htmlFor="landing-prompt-preview" className="sr-only">
                  {t("preview.promptLabel")}
                </label>
                <textarea
                  id="landing-prompt-preview"
                  readOnly
                  aria-label={t("preview.promptLabel")}
                  placeholder={t("preview.placeholder")}
                  className="h-24 w-full resize-none border-none bg-transparent p-4 text-sm leading-6 text-white outline-none placeholder:text-white/45"
                />
              </>
            }
            footer={
              <div className="grid gap-3 border-t border-white/12 p-3 lg:grid-cols-[1fr_1fr_0.62fr]">
                <Link
                  href="/model"
                  className="flex min-h-14 items-center justify-between rounded-xl border border-white/12 bg-black/16 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-white/46">
                      {t("preview.modelLabel")}
                    </span>
                    <span className="block truncate text-sm font-medium text-white">
                      {t("preview.model")}
                    </span>
                  </span>
                  <ChevronDown className="h-5 w-5 text-white/62" />
                </Link>
                <Link
                  href="/image"
                  className="flex min-h-14 items-center justify-between rounded-xl border border-white/12 bg-black/16 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-white/46">
                      {t("preview.aspectLabel")}
                    </span>
                    <span className="block truncate text-sm font-medium text-white">
                      {t("preview.aspect")}
                    </span>
                  </span>
                  <ChevronDown className="h-5 w-5 text-white/62" />
                </Link>
                <AppButton
                  asChild
                  size="lg"
                  className="h-full min-h-14 rounded-xl text-sm"
                >
                  <Link href="/image">
                    {t("preview.generate")}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </AppButton>
              </div>
            }
          />
        </div>
      </div>
    </section>
  );
}
