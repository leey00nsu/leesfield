import Image from "next/image";
import Link from "next/link";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

export function LandingReuseSection() {
  const t = useTranslations("landing.reuse");

  return (
    <section className="overflow-hidden px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-16 lg:grid-cols-[0.58fr_0.42fr]">
        <div className="relative min-h-[36rem]">
          <div className="absolute left-0 top-0 h-[34rem] w-[26rem] overflow-hidden rounded-[1.35rem] border border-white/16">
            <Image
              src="/assets/creative-studio/mirror-portrait.jpg"
              alt={t("imageAlt")}
              fill
              sizes="(min-width: 1024px) 420px, 80vw"
              className="object-cover"
            />
            <span className="absolute left-6 top-6 rounded-lg bg-black/48 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
              <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
              {t("badge")}
            </span>
          </div>

          <AppCard variant="editorial" radius="md" padding="md" className="absolute left-[18rem] top-28 w-56">
            <p className="text-sm font-semibold text-white">{t("prompt.title")}</p>
            <p className="mt-4 text-sm leading-6 text-white/68">
              {t("prompt.body")}
            </p>
            <span className="mt-4 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-bold text-black">
              v2
            </span>
          </AppCard>

          <AppCard variant="editorial" radius="md" padding="md" className="absolute bottom-0 left-16 w-64">
            <p className="text-sm font-semibold text-white">
              <SlidersHorizontal className="mr-2 inline h-4 w-4 text-primary" />
              {t("settings.title")}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-white/54">Model</dt>
              <dd className="text-right text-white">GPT Image 2</dd>
              <dt className="text-white/54">Aspect</dt>
              <dd className="text-right text-white">16:9</dd>
              <dt className="text-white/54">Style</dt>
              <dd className="text-right text-white">Cinematic</dd>
            </dl>
          </AppCard>

        </div>

        <div>
          <AppEyebrow>{t("eyebrow")}</AppEyebrow>
          <AppHeading className="mt-7 max-w-[10.75ch] text-[clamp(2.45rem,4.6vw,5.2rem)]">
            {t("title")}
          </AppHeading>
          <p className="mt-8 max-w-xl text-base leading-7 text-white/72 md:text-lg">
            {t("description")}
          </p>
          <AppButton
            asChild
            size="lg"
            className="mt-10 rounded-full px-8 text-base font-semibold"
          >
            <Link href="/history">{t("cta")}</Link>
          </AppButton>
        </div>
      </div>
    </section>
  );
}
