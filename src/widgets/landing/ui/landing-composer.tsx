"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Images, LayoutTemplate, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import { AppButtonPresentation } from "@/shared/ui/app-button";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationMediaRail } from "@/shared/ui/generation-media-rail";
import { buildLoginHref } from "@/features/auth/lib/login-redirect";
import { LandingHeroMotionLayer } from "./landing-hero-form-motion";

type Media = "image" | "video" | "audio";
// Public editorial name only. Never a catalog key or a submitted model value.
const PUBLIC_MODEL_LABEL = "GPT Image 2.5";
export function LandingComposer({ media, isAuthenticated = false }: { media: Media; isAuthenticated?: boolean }) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = shell.current;
    const layout = element?.firstElementChild;
    if (!element || !(layout instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver(() => {
      const bounds = layout.getBoundingClientRect();
      if (bounds.width !== width) {
        width = bounds.width;
        height = 0;
        layout.style.minHeight = "";
      }
      height = Math.max(height, layout.getBoundingClientRect().height);
      layout.style.minHeight = height + "px";
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);
  const t = useTranslations("landing.hero");
  const generation = useTranslations("generation");
  const presets = useTranslations("promptPresets");
  const labels = useTranslations("common.labels");
  const ko = useLocale() === "ko";
  const destination = `/generate?type=${media}`;
  const href = isAuthenticated ? destination : buildLoginHref(destination);
  return <div ref={shell} className="landing-composer w-full">
    <GenerationPromptField testId="landing-hero-form-surface" surface="hero"
      className="landing-hero-field relative mx-auto w-full max-w-4xl rounded-[1.05rem] border-0 p-3 sm:p-4"
      mediaSelector={<GenerationMediaRail />}
      contentWrapper={children => <>
        <LandingHeroMotionLayer testId="landing-hero-form-border-motion" className="pointer-events-none absolute inset-0 rounded-[1.05rem] border border-white/12" />
        <LandingHeroMotionLayer testId="landing-hero-form-motion" className="pointer-events-none flex flex-1 [&>div]:flex-1">
          <div aria-hidden="true" className="flex min-w-0 flex-1">{children}</div>
        </LandingHeroMotionLayer>
        <Link href={href} aria-label={t("preview.generate")} data-testid="landing-generation-entry"
          className="absolute inset-0 z-10 rounded-[1.05rem] outline-none focus-visible:ring-2 focus-visible:ring-data-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
      </>}
      attachments={<div className="flex items-center gap-2 px-4 pt-4">
        <AppButtonPresentation variant="surface-muted" size="pill-sm"><Plus className="size-4" />{ko ? "첨부" : "Attach"}</AppButtonPresentation>
      </div>}
      textarea={<div data-landing-prompt-preview className="min-h-32 flex-1 p-4 text-sm leading-6 text-muted-foreground">{t(`preview.placeholders.${media}`)}</div>}
      footerLeft={<>
        <AppButtonPresentation>{PUBLIC_MODEL_LABEL}<ChevronDown className="size-4 text-white/46" /></AppButtonPresentation>
        <AppButtonPresentation><SlidersHorizontal className="size-4" />{labels("advancedOptions")}<ChevronDown className="size-4 text-white/46" /></AppButtonPresentation>
        <AppButtonPresentation><LayoutTemplate className="size-4" />{presets("button")}<ChevronDown className="size-4 text-white/46" /></AppButtonPresentation>
        {media === "image" && <AppButtonPresentation><Images className="size-4" />{generation("imageCountPicker.label")} · {generation("imageCountPicker.count", {count:1})}<ChevronDown className="size-4 text-white/46" /></AppButtonPresentation>}
      </>}
      footerRight={<AppButtonPresentation variant="generate" size="lg" className="h-auto min-h-12 w-full sm:w-auto">{t("preview.generate")}<Sparkles className="size-4" /></AppButtonPresentation>} />
  </div>;
}
