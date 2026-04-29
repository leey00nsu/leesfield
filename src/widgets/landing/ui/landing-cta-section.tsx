import { useTranslations } from "next-intl";
import { CtaCard } from "@/shared/ui/cta-card";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto w-full max-w-[1500px]">
        <CtaCard title={t("title")} buttonText={t("button")} href="/image" />
      </div>
    </section>
  );
}
