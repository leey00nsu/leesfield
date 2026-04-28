import Image from "next/image";
import Link from "next/link";
import { AudioLines, Clapperboard, Images, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

const creationLinks = [
  {
    key: "image",
    href: "/image",
    icon: Images,
    image: "/assets/creative-studio/mirror-portrait.jpg",
    className: "lg:col-span-2 lg:row-span-2",
  },
  {
    key: "video",
    href: "/video",
    icon: Clapperboard,
    image: "/assets/creative-studio/film-production.jpg",
    className: "lg:col-span-2",
  },
  {
    key: "audio",
    href: "/audio",
    icon: AudioLines,
    image: "/assets/creative-studio/audio-console.jpg",
    className: "lg:col-span-2",
  },
] as const;

const statKeys = ["image", "video", "audio"] as const;

export function LandingFeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section className="relative overflow-hidden border-y border-white/5 bg-[#060708] px-6 py-20 sm:px-10 lg:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_50%_0%,rgba(48,66,78,0.32),transparent_62%)]" />
      <div className="relative mx-auto grid w-full max-w-[1600px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div className="lg:sticky lg:top-28">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-5 max-w-3xl text-5xl font-black uppercase leading-[0.92] text-white sm:text-7xl lg:text-8xl">
            {t("title")}
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            {t("description")}
          </p>

          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {statKeys.map((key) => (
              <div
                key={key}
                className="border-t border-white/15 pt-4"
              >
                <p className="text-3xl font-black text-white">
                  {t(`stats.${key}.value`)}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
                  {t(`stats.${key}.label`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid auto-rows-[12rem] grid-cols-2 gap-3 lg:auto-rows-[13rem] lg:grid-cols-4">
          {creationLinks.map((item, index) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#111517]",
                  "transition-transform duration-500 hover:-translate-y-1",
                  item.className,
                )}
              >
                <Image
                  src={item.image}
                  alt={t(`lanes.${item.key}.imageAlt`)}
                  fill
                  sizes="(min-width: 1024px) 38vw, 90vw"
                  className="object-cover opacity-82 transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/88 via-black/15 to-transparent" />
                <div className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-black">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <p className="text-xs font-mono text-gray-400">
                    0{index + 1}
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-white">
                    {t(`lanes.${item.key}.title`)}
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    {t(`lanes.${item.key}.description`)}
                  </p>
                </div>
              </Link>
            );
          })}

          <div className="relative col-span-2 min-h-52 overflow-hidden rounded-[1.6rem] border border-white/10 bg-primary p-6 text-black lg:col-span-4">
            <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-black/15 blur-2xl" />
            <p className="text-xs font-black uppercase tracking-[0.24em]">
              {t("motion.eyebrow")}
            </p>
            <h3 className="mt-4 max-w-4xl text-4xl font-black uppercase leading-[0.95] sm:text-5xl">
              {t("motion.title")}
            </h3>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-black/70 sm:text-base">
              {t("motion.description")}
            </p>
            <Button
              asChild
              variant="surface"
              className="mt-7 border-black/10 bg-black text-white hover:bg-black/85"
            >
              <Link href="/image">
                {t("laneCta")}
                <WandSparkles className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
