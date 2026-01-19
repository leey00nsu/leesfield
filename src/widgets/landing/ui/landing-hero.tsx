import Link from "next/link";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

export function LandingHero() {
  const t = useTranslations("landing.hero");
  const tBrand = useTranslations("common.brand");

  return (
    <section className="border-b border-white/5 bg-background-dark/95 px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-6xl">
              <span className="text-white">{tBrand("leading")}</span>
              <span className="text-primary">{tBrand("trailing")}</span>
            </h1>
            <p className="mt-3 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {t("status")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" variant="hero">
              <Link href="/image">
                <Zap className="h-4 w-4" />
                {t("primaryCta")}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl border-white/10 bg-surface-dark text-white hover:border-white hover:bg-white/5"
            >
              <Link href="/api-docs">{t("secondaryCta")}</Link>
            </Button>
          </div>
        </div>

        <p className="max-w-3xl text-lg text-gray-300 leading-relaxed sm:text-xl">
          {t("description")}
        </p>
      </div>
    </section>
  );
}
