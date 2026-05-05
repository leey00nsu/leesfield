import { useTranslations } from "next-intl";
import { CtaCard } from "@/shared/ui/cta-card";
import { LandingReveal } from "./landing-motion";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto w-full max-w-[1500px]">
        <LandingReveal testId="landing-cta-reveal" scale={0.985} y={20}>
          <CtaCard title={t("title")} buttonText={t("button")} href="/image" />
        </LandingReveal>
      </div>
    </section>
  );
}
