import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

export function LandingCtaSection() {
  const t = useTranslations("landing.cta");
  const faqKeys = ["ownership", "reuse", "access"] as const;

  return (
    <section className="px-6 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 border-y border-white/10 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {faqKeys.map((key) => (
            <div
              key={key}
              className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-5"
            >
              <p className="text-sm font-black uppercase tracking-wider text-white">
                {t(`faq.${key}.title`)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {t(`faq.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
