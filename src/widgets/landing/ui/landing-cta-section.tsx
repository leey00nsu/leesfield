import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="px-6 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start justify-between gap-6 border-y border-white/10 py-10 md:flex-row md:items-center">
        <div>
          <h3 className="text-3xl font-black uppercase text-white">
            {t("title")}
          </h3>
          <p className="mt-3 max-w-2xl text-base text-gray-400">
            {t("description")}
          </p>
        </div>
        <Button asChild size="lg" variant="hero">
          <Link href="/login">{t("button")}</Link>
        </Button>
      </div>
    </section>
  );
}
