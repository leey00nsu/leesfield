import Link from "next/link";
import Image from "next/image";
import { AudioLines, Clapperboard, FileText, Images, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

const creationLinks = [
  { key: "image", href: "/image", icon: Images, primary: true },
  { key: "video", href: "/video", icon: Clapperboard, primary: false },
  { key: "audio", href: "/audio", icon: AudioLines, primary: false },
] as const;

const starterPrompts = ["editorial", "product", "voiceover"] as const;

export function LandingHero() {
  const t = useTranslations("landing.hero");
  const tBrand = useTranslations("common.brand");

  return (
    <section className="border-b border-white/5 bg-background-dark/95 px-6 pb-12 pt-8 sm:px-10 lg:pb-16">
      <div className="mx-auto grid w-full max-w-[1600px] gap-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,0.72fr)] lg:items-center">
        <div className="flex max-w-4xl flex-col gap-7">
          <div>
            <p className="flex items-center gap-2 text-xs font-mono text-gray-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {t("status")}
            </p>
            <h1 className="mt-4 text-4xl font-black uppercase leading-tight text-white sm:text-6xl">
              <span className="text-white">{tBrand("leading")}</span>
              <span className="text-primary">{tBrand("trailing")}</span>
            </h1>
          </div>

          <p className="max-w-3xl text-lg leading-relaxed text-gray-300 sm:text-xl">
            {t("description")}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
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
                      <span className="text-xs font-normal opacity-75">
                        {t(`creation.${item.key}.description`)}
                      </span>
                    </span>
                  </Link>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ul
              aria-label={t("starterPrompts.label")}
              className="flex flex-wrap gap-2"
            >
              {starterPrompts.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-gray-300"
                >
                  {t(`starterPrompts.items.${item}`)}
                </li>
              ))}
            </ul>

            <Link
              href="/api-docs"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <FileText className="h-4 w-4" />
              {t("secondaryCta")}
            </Link>
          </div>
        </div>

        <div
          role="region"
          aria-label={t("preview.label")}
          className="creative-surface relative overflow-hidden rounded-2xl border p-3"
        >
          <div className="grid gap-3 sm:grid-cols-[1.15fr_0.85fr]">
            <div className="relative min-h-[360px] overflow-hidden rounded-xl bg-background">
              <Image
                src="/sample-image.png"
                alt={t("preview.imageAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-4">
                <p className="text-sm font-semibold text-white">
                  {t("preview.imageTitle")}
                </p>
                <p className="mt-1 text-xs text-gray-300">
                  {t("preview.imageDescription")}
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-background/35">
                <video
                  aria-label={t("preview.videoLabel")}
                  className="aspect-video w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  poster="/sample-image.png"
                >
                  <source src="/sample-video.mp4" type="video/mp4" />
                </video>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-white">
                    {t("preview.videoTitle")}
                  </span>
                  <Clapperboard className="h-4 w-4 text-primary" />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-surface-dark/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">
                    {t("preview.audioTitle")}
                  </span>
                  <AudioLines className="h-4 w-4 text-emerald-300" />
                </div>
                <div
                  aria-label={t("preview.audioLabel")}
                  className="mt-4 flex h-20 items-end gap-1"
                >
                  {Array.from({ length: 18 }).map((_, index) => (
                    <span
                      key={index}
                      className="w-full rounded-full bg-primary/70"
                      style={{ height: `${28 + (index % 5) * 12}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-background/35 px-4 py-3 text-sm text-gray-300">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("preview.caption")}
          </div>
        </div>
      </div>
    </section>
  );
}
