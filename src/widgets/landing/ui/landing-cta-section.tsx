import { useTranslations } from "next-intl";
import { CtaCard } from "@/shared/ui/cta-card";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="px-6 sm:px-10">
      <div className="mx-auto w-full max-w-[1600px] py-4">
        <CtaCard title={t("title")} buttonText={t("button")} href="/image" />
      </div>
    </section>
  );
}
