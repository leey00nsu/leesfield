import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, Code2, ArrowRight } from "lucide-react";
import { RevealContent } from "@/shared/ui/brand/reveal-content/reveal-content";
import { AppButton } from "@/shared/ui/app-button";
export function LandingCtaSection() {
  const t = useTranslations("inferenceLanding.cta");
  return (
    <section className="mx-auto w-full max-w-[72rem] border-t px-5 py-20 sm:px-7 sm:py-24 lg:px-8">
      <RevealContent suppressHydrationWarning variant="fade">
        <h2 className="text-center text-2xl font-medium tracking-[-0.035em]">
          {t("title")}
        </h2>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {["create", "api"].map((key, index) => {
            const Icon = index ? Code2 : Sparkles;
            return (
              <article
                key={key}
                className={`flex min-h-64 flex-col rounded-xl p-7 sm:p-9 ${index ? "border border-white/10 bg-background shadow-inner" : "border border-white/15 bg-gradient-to-br from-[#303035] to-[#1c1c20] shadow-[0_20px_60px_-25px_rgba(0,0,0,0.9)]"}`}
              >
                <Icon aria-hidden="true" className="size-5" />
                <h3 className="mt-6 text-lg font-semibold tracking-[-0.025em]">
                  {t(`${key}Title`)}
                </h3>
                <p className="mt-2 mb-7 max-w-md text-xs leading-5 text-muted-foreground">
                  {t(`${key}Description`)}
                </p>
                <AppButton
                  asChild
                  variant={index ? "surface" : "primary"}
                  className="mt-auto"
                >
                  <Link href={index ? "/api-docs" : "/generate"}>
                    {t(`${key}Action`)}
                    <ArrowRight className="size-4" />
                  </Link>
                </AppButton>
              </article>
            );
          })}
        </div>
      </RevealContent>
    </section>
  );
}
