import Link from "next/link";
import Image from "next/image";
import { AudioLines, Clapperboard, FileText, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

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
        <div
          role="region"
          aria-label={t("preview.label")}
          className="relative h-56 w-full max-w-4xl sm:h-72"
        >
          <div className="lf-motion-card-a absolute left-[8%] top-8 h-36 w-[34%] -rotate-6 overflow-hidden rounded-2xl border-4 border-white/20 bg-background shadow-2xl sm:h-48">
            <Image
              src="/assets/creative-studio/mirror-portrait.jpg"
              alt={t("preview.imageAlt")}
              fill
              priority
              sizes="(min-width: 1024px) 28vw, 70vw"
              className="object-cover"
            />
          </div>
          <div className="lf-motion-card-b absolute left-[31%] top-2 h-40 w-[30%] rotate-2 overflow-hidden rounded-2xl border-4 border-white/15 bg-background shadow-2xl sm:h-56">
            <video
              aria-label={t("preview.videoLabel")}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              poster="/assets/creative-studio/studio-vocalist.jpg"
            >
              <source src="/sample-video.mp4" type="video/mp4" />
            </video>
          </div>
          <div
            aria-label={t("preview.audioLabel")}
            className="lf-motion-card-c absolute left-[57%] top-9 h-36 w-36 overflow-hidden rounded-full border-4 border-white/20 bg-background shadow-2xl sm:h-48 sm:w-48"
          >
            <Image
              src="/assets/creative-studio/audio-console.jpg"
              alt={t("preview.audioImageAlt")}
              fill
              sizes="(min-width: 1024px) 12rem, 9rem"
              className="object-cover"
            />
          </div>
          <div className="lf-motion-card-d absolute right-[4%] top-8 h-36 w-[28%] rotate-3 overflow-hidden rounded-2xl border-4 border-white/20 bg-background shadow-2xl sm:h-48">
            <Image
              src="/assets/creative-studio/film-production.jpg"
              alt={t("preview.imageAlt")}
              fill
              sizes="(min-width: 1024px) 24vw, 64vw"
              className="object-cover"
            />
          </div>
        </div>

        <div className="flex max-w-5xl flex-col items-center gap-6">
          <p className="lf-motion-rise flex items-center gap-2 text-xs font-mono text-gray-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t("status")}
          </p>
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
      </div>
    </section>
  );
}
