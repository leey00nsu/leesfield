import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <div className="rounded-3xl border border-white/10 bg-surface-dark/80 px-8 py-10">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h3 className="text-2xl font-bold text-white">
            {t("title")}
          </h3>
          <p className="mt-2 text-sm text-gray-400">
            {t("description")}
          </p>
        </div>
        <Button asChild size="lg" variant="hero">
          <Link href="/login">{t("button")}</Link>
        </Button>
      </div>
    </div>
  );
}
