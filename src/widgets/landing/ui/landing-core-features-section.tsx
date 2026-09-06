import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BentoGrid,
  BentoGridItem,
} from "@/shared/ui/brand/bento-grid/bento-grid";
import { RevealContent } from "@/shared/ui/brand/reveal-content/reveal-content";
import { LandingProductPreview } from "./landing-product-preview";
export function LandingCoreFeaturesSection() {
  const t = useTranslations("inferenceLanding");
  return (
    <section
      aria-label={t("bentoLabel")}
      className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-28"
    >
      <RevealContent suppressHydrationWarning variant="section">
        <p className="text-sm text-data-accent-foreground">
          {t("platformEyebrow")}
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-medium tracking-tight sm:text-4xl">
          {t("platformTitle")}
        </h2>
      </RevealContent>
      <RevealContent suppressHydrationWarning variant="fade" className="mt-10">
        <BentoGrid className="gap-px overflow-hidden rounded-2xl border bg-border">
          {(["jobs", "catalog", "monitor", "api"] as const).map(
            (key, index) => (
              <div
                key={key}
                className={
                  "flex flex-col bg-[#141416] " +
                  ([1, 2].includes(index) ? "md:col-span-4" : "md:col-span-2")
                }
              >
                <BentoGridItem
                  className="min-h-[300px] flex-1 rounded-none border-0 bg-transparent hover:translate-y-0"
                  title={t(key + ".title")}
                >
                  <div className="flex w-full flex-col transition-transform duration-500 ease-out group-hover/bento:scale-[1.025] motion-reduce:transform-none">
                    <LandingProductPreview kind={key} />
                    {key !== "api" && (
                      <Link
                        href={
                          {
                            jobs: "/monitoring",
                            catalog: "/model",
                            monitor: "/monitoring",
                            api: "/api-docs",
                          }[key]
                        }
                        aria-label={t(key + ".title")}
                        className="absolute inset-0"
                      ></Link>
                    )}
                  </div>
                </BentoGridItem>
                <p className="px-4 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-5">
                  {t(key + ".description")}
                </p>
              </div>
            ),
          )}
        </BentoGrid>
      </RevealContent>
    </section>
  );
}
