import Link from "next/link";
import { useTranslations } from "next-intl";
import { Boxes, Code2, Activity, Workflow, ArrowUpRight } from "lucide-react";
import { RevealContent } from "@/shared/ui/brand/reveal-content/reveal-content";
export function LandingPlatformSection() {
  const t = useTranslations("inferenceLanding.guides");
  return (
    <section className="mx-auto w-full max-w-[72rem] px-5 py-24 sm:px-7 sm:py-32 lg:px-8 lg:py-40">
      <RevealContent variant="section">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-medium tracking-[-0.035em]">
          {t("title")}
        </h2>
      </RevealContent>
      <RevealContent
        className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        delay={100}
        variant="stagger"
      >
        {[Boxes, Code2, Activity, Workflow].map((Icon, index) => (
          <article data-reveal-item key={index}>
            <Link
              href={["/model", "/api-docs", "/monitoring", "/spaces"][index]}
              className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <div
                className="relative flex aspect-[1.65] items-center justify-center overflow-hidden rounded-lg border bg-card"
                data-reveal-media
              >
                <Icon
                  aria-hidden="true"
                  className="size-9 text-data-accent-foreground transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
                />
                <ArrowUpRight
                  aria-hidden="true"
                  className="absolute right-3 top-3 size-4 text-muted-foreground"
                />
              </div>
              <p className="mt-3 text-[9px] text-muted-foreground uppercase">
                {t(`items.${index}.label`)}
              </p>
              <h3 className="mt-1 text-xs font-semibold">
                {t(`items.${index}.title`)}
              </h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {t(`items.${index}.description`)}
              </p>
            </Link>
          </article>
        ))}
      </RevealContent>
    </section>
  );
}
