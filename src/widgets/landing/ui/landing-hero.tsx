"use client";
import { useLandingReducedMotion as useReducedMotion } from "./use-landing-reduced-motion";

import { useVerticalMediaRail } from "@/shared/ui/generation-media-rail";
import Image from "next/image";
import { motion } from "motion/react";
import { LandingTitleMotion, titleInitialStyle } from "./landing-title-motion";
import { LayoutTextFlip } from "./aceternity-layout-text-flip";
import { BrandUnplug } from "./brand-unplug";
import models from "@/shared/config/brand-models.json";
import { useState } from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppHeading } from "@/shared/ui/app-typography";
import { LandingComposer } from "./landing-composer";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";
import { LandingHeroMotionLayer } from "./landing-hero-form-motion";

// Models sharing a logo occupy a single slot in the logo-only flip.
const flipModels = models.filter(
  (model, index, all) => all.findIndex((item) => item.logo === model.logo) === index,
);

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
          data-title-step={startIndex + index}
          key={`${word}-${index}`}
          className="inline-block"
          style={titleInitialStyle}
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : null}
        </span>
      ))}
    </span>
  );
}

export function LandingHero({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const entry = (delay: number) => ({
    initial: reduced ? (false as const) : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: reduced ? 0 : delay,
      duration: reduced ? 0 : 0.64,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });
  const t = useTranslations("landing.hero");
  const [media, setMedia] = useState<"image" | "video" | "audio">("image");
  const vertical = useVerticalMediaRail();
  const headlineFirst = t("headlineFirst");
  const headlineSecond = t("headlineSecond");
  const fullHeadline = `${headlineFirst} ${headlineSecond}`;

  return (
    <section className="relative flex min-h-[calc(100svh-80px)] items-center overflow-hidden px-5 pb-20 pt-20 sm:px-10 sm:pt-24 lg:pb-28 lg:pt-32">
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col items-center">
        <div className="mx-auto max-w-6xl text-center">
          <motion.p
            {...entry(0)}
            className="mx-auto mb-7 inline-flex min-h-7 items-center gap-2 rounded-full border bg-card px-3 text-[10px] text-muted-foreground"
          >
            <span className="rounded-full bg-data-accent/15 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-data-accent-foreground uppercase">
              {t("new")}
            </span>
            <Link href="#spaces" className="inline-flex items-center gap-2">
              {t("announcement")}
              <ArrowRight className="size-3" />
            </Link>
          </motion.p>
          <AppHeading
            as="h1"
            size="hero"
            aria-label={fullHeadline}
            className="text-[clamp(1.65rem,4.6vw,4.4rem)] leading-[1.15]"
          >
            <LandingTitleMotion>
              <span className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5">
                <LayoutTextFlip
                  text={headlineFirst}
                  textGroups={[headlineFirst.split(" ")[0], headlineFirst.split(" ").slice(1).join(" ")]}
                  words={flipModels.map((model) => model.name)}
                  renderWord={(_name, index) => (
                    <span className="flex size-full items-center justify-center leading-none">
                      <Image
                        src={flipModels[index].logo}
                        alt={flipModels[index].organization}
                        width={72}
                        height={72}
                        loading="eager"
                        unoptimized
                        className="size-full rounded-[0.12em] object-contain"
                      />
                    </span>
                  )}
                />
              </span>
              <span className="flex items-center justify-center gap-[0.16em]">
                <TextGenerateLine
                  text={t("headlineSecondFirst")}
                  startIndex={2}
                />
                <span
                  data-title-step={2}
                  className="inline-flex"
                  style={titleInitialStyle}
                >
                  <BrandUnplug />
                </span>
                <span
                  data-title-step={3}
                  className="inline-block"
                  style={titleInitialStyle}
                >
                  <span className="lf-brand-gradient-text">
                    {t("headlineInterface")}
                  </span>
                  {t("headlineSuffix")}
                </span>
              </span>
            </LandingTitleMotion>
          </AppHeading>
          <motion.p
            {...entry(0.76)}
            className="mt-6 whitespace-pre-line text-sm leading-7 text-white/68 md:text-lg"
          >
            {t("subhead")}
          </motion.p>
          <motion.div
            {...entry(0.94)}
            className="mt-7 flex flex-wrap justify-center gap-2.5"
          >
            <AppButton asChild>
              <Link href="/generate">
                {t("primaryAction")}
                <Sparkles className="size-4" />
              </Link>
            </AppButton>
            <AppButton asChild variant="surface">
              <Link href="#spaces">
                {t("secondaryAction")}
                <ArrowRight className="size-4" />
              </Link>
            </AppButton>
          </motion.div>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative mt-10 w-full max-w-6xl overflow-hidden rounded-[1.5rem] bg-[radial-gradient(ellipse_at_top_right,#5386bb,#10376c_55%,#08172c)] p-6 sm:p-8 lg:p-10"
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

          <LandingHeroMotionLayer glass testId="landing-hero-composer-motion">
            <TabsPrimitive.Root
              value={media}
              onValueChange={(value) => setMedia(value as typeof media)}
              orientation={vertical ? "vertical" : "horizontal"}
              data-vertical={vertical ? "" : undefined}
              data-horizontal={!vertical ? "" : undefined}
              className="group/tabs relative mx-auto w-full max-w-4xl"
            >
              <LandingComposer
                media={media}
                isAuthenticated={isAuthenticated}
              />
            </TabsPrimitive.Root>
          </LandingHeroMotionLayer>
        </div>
      </div>
    </section>
  );
}
