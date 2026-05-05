import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Code2,
  Eye,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AppCard } from "@/shared/ui/app-card";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

const workflowItems = [
  { key: "generate", icon: Sparkles, href: "/image" },
  { key: "review", icon: Eye, href: "/history" },
  { key: "monitor", icon: ChartNoAxesCombined, href: "/monitoring" },
  { key: "integrate", icon: Code2, href: "/api-docs" },
] as const;

export function LandingCoreFeaturesSection() {
  const t = useTranslations("landing.workflow");

  return (
    <section className="px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mx-auto max-w-4xl text-center">
          <AppEyebrow>{t("eyebrow")}</AppEyebrow>
          <AppHeading className="mt-7">
            {t("title")}
          </AppHeading>
          <p className="mx-auto mt-7 max-w-3xl text-base leading-7 text-white/64 md:text-lg">
            {t("description")}
          </p>
        </div>

        <div className="mt-20 grid gap-4 lg:grid-cols-4">
          {workflowItems.map((item) => {
            const Icon = item.icon;
            return (
              <AppCard
                key={item.key}
                variant="editorial"
                className="group min-h-[34rem] rounded-[1.35rem] p-0 transition-transform duration-300 hover:-translate-y-1"
              >
                <Link href={item.href} className="flex min-h-[34rem] flex-col p-6">
                  <div className="flex items-center gap-3 text-primary">
                    <Icon className="h-6 w-6" />
                    <span className="font-semibold">{t(`items.${item.key}.title`)}</span>
                  </div>
                  <div className="mt-8 h-56 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/18 p-4">
                    <MiniWorkflowPreview itemKey={item.key} />
                  </div>
                  <div className="mt-8 flex flex-1 flex-col border-t border-primary/55 pt-6">
                    <p className="max-w-xs text-base leading-7 text-white/78">
                      {t(`items.${item.key}.description`)}
                    </p>
                    <span className="mt-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-black transition-transform group-hover:translate-x-1">
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  </div>
                </Link>
              </AppCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniWorkflowPreview({ itemKey }: { itemKey: string }) {
  const t = useTranslations("landing.workflow.preview");

  if (itemKey === "review") {
    return (
      <div
        data-testid="landing-review-skeleton-grid"
        className="grid h-full grid-cols-6 grid-rows-6 gap-2"
      >
        <SkeletonGridTile className="col-span-3 row-span-3" />
        <SkeletonGridTile className="col-span-3 row-span-2" />
        <SkeletonGridTile className="col-span-2 row-span-2" />
        <SkeletonGridTile className="col-span-2 row-span-3" />
        <SkeletonGridTile className="col-span-2 row-span-2" />
        <SkeletonGridTile className="col-span-2 row-span-2" />
      </div>
    );
  }

  if (itemKey === "monitor") {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="grid grid-cols-3 gap-2 text-xs text-white/56">
          <MetricPreview label={t("success")} value="99.2%" />
          <MetricPreview label={t("jobs")} value="432" />
          <MetricPreview label={t("latency")} value="1.2s" />
        </div>
        <div className="flex h-20 items-end gap-1.5">
          {[32, 46, 40, 58, 44, 52, 66, 49, 62, 72, 56, 68, 60, 76].map(
            (height, index) => (
              <span
                key={`${height}-${index}`}
                className="flex-1 rounded-t bg-primary/80"
                style={{ height: `${height}%` }}
              />
            ),
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/62">
          <span>{t("usage")}</span>
          <span className="text-primary">{t("live")}</span>
        </div>
      </div>
    );
  }

  if (itemKey === "integrate") {
    return (
      <div className="flex h-full flex-col text-sm text-white/62">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-primary/15 px-2 py-1 font-semibold text-primary">
            POST
          </span>
          <span>/v2/image/generate</span>
        </div>
        <div className="mt-4 flex-1 rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-xs leading-6 text-white/58">
          <p>{'{"model": "gpt-image-2",'}</p>
          <p>{'"prompt": "studio product shot",'}</p>
          <p>{'"aspect_ratio": "16:9"}'}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="rounded-lg bg-white/8 px-3 py-2 text-center">
            {t("apiKeys")}
          </span>
          <span className="rounded-lg bg-primary py-2 text-center font-semibold text-black">
            {t("docs")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 border-b border-white/10 text-center text-xs text-white/70">
        <span className="border-b border-primary py-2 text-primary">
          {t("image")}
        </span>
        <span className="py-2">{t("video")}</span>
        <span className="py-2">{t("audio")}</span>
      </div>
      <div className="mt-3 h-24 rounded-lg bg-white/8" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="h-12 rounded-lg bg-white/8" />
        <div className="h-12 rounded-lg bg-white/8" />
      </div>
      <div className="mx-auto mt-5 h-10 w-36 rounded-lg bg-primary" />
    </div>
  );
}

function MetricPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.04] p-2">
      <p>{label}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
    </div>
  );
}

function SkeletonGridTile({ className }: { className: string }) {
  return (
    <div
      className={`rounded-lg border border-white/8 bg-white/[0.075] ${className}`}
    />
  );
}
