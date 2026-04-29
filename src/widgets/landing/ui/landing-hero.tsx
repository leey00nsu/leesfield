import Link from "next/link";
import {
  AudioLines,
  ChevronDown,
  Clapperboard,
  FileText,
  ImagePlus,
  Images,
  Plus,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

const creationLinks = [
  { key: "image", href: "/image", icon: Images, primary: true },
  { key: "video", href: "/video", icon: Clapperboard, primary: false },
  { key: "audio", href: "/audio", icon: AudioLines, primary: false },
] as const;

export function LandingHero() {
  const t = useTranslations("landing.hero");
  const tBrand = useTranslations("common.brand");

  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-[#080a0c] px-6 pb-12 pt-10 sm:px-10 lg:pb-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_18%,rgba(28,62,80,0.34),transparent_62%)]" />
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col items-center gap-8 text-center">
        <div className="flex max-w-5xl flex-col items-center gap-6">
          <h1 className="lf-motion-rise text-4xl font-black uppercase leading-tight text-white sm:text-6xl">
            <span className="text-white">{tBrand("leading")}</span>
            <span className="text-primary">{tBrand("trailing")}</span>
          </h1>

          <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            {creationLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.key}
                  asChild
                  size="lg"
                  variant={item.primary ? "hero" : "surface"}
                  className={cn(
                    "h-auto min-h-14 justify-start rounded-xl px-4 py-3 tracking-normal",
                    item.primary ? "shadow-none" : "bg-creative-surface-muted",
                  )}
                >
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    <span className="flex flex-col items-start gap-0.5 text-left">
                      <span className="font-semibold">
                        {t(`creation.${item.key}.label`)}
                      </span>
                    </span>
                  </Link>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/api-docs"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <FileText className="h-4 w-4" />
              {t("secondaryCta")}
            </Link>
          </div>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative mt-2 w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#061215] p-4 shadow-2xl shadow-primary/10 sm:p-6 lg:rounded-[2.5rem] lg:p-10"
        >
          <WarpShaderPanel className="absolute inset-0 opacity-95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.22),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.5))]" />
          <div className="relative mx-auto flex min-h-[22rem] max-w-5xl items-end justify-center py-10 sm:min-h-[28rem]">
            <div className="w-full rounded-[1.75rem] border border-white/15 bg-[#15191d]/88 p-3 text-left shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-4">
              <div className="min-h-32 rounded-2xl border border-white/5 bg-[#111518]/78 p-4 sm:min-h-40 sm:p-5">
                <label htmlFor="landing-prompt-preview" className="sr-only">
                  {t("preview.promptLabel")}
                </label>
                <textarea
                  id="landing-prompt-preview"
                  readOnly
                  aria-label={t("preview.promptLabel")}
                  className="h-full min-h-24 w-full resize-none bg-transparent text-base text-white outline-none placeholder:text-transparent sm:min-h-32"
                />
              </div>
              <div className="mt-3 flex flex-col gap-3 border-t border-white/5 pt-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    asChild
                    variant="surface"
                    size="icon"
                    className="h-11 w-11 rounded-xl bg-white/5"
                  >
                    <Link href="/image" aria-label={t("preview.attachLabel")}>
                      <Plus className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="surface"
                    className="h-11 rounded-xl border-primary/70 bg-[#202416] px-4 text-white"
                  >
                    <Link href="/image">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        H
                      </span>
                      {t("preview.model")}
                      <ChevronDown className="h-4 w-4 text-primary" />
                    </Link>
                  </Button>
                  <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-gray-200">
                    <ImagePlus className="h-4 w-4" />
                    {t("preview.aspect")}
                  </span>
                  <span className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-gray-200">
                    {t("preview.quality")}
                  </span>
                </div>
                <Button
                  asChild
                  variant="hero"
                  className="h-14 rounded-2xl px-8 text-base font-black"
                >
                  <Link href="/image">
                    {t("preview.generate")}
                    <Sparkles className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
