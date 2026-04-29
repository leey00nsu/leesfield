import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Layers3,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

const workflowItems = [
  { key: "generate", icon: Sparkles, href: "/image" },
  { key: "review", icon: Eye, href: "/history" },
  { key: "reuse", icon: Layers3, href: "/history" },
  { key: "deliver", icon: Send, href: "/api-docs" },
] as const;

export function LandingCoreFeaturesSection() {
  const t = useTranslations("landing.workflow");

  return (
    <section className="px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mx-auto max-w-4xl text-center">
          <p className="lf-eyebrow">{t("eyebrow")}</p>
          <h2 className="lf-serif mt-7 text-[clamp(3.25rem,6vw,6.8rem)] leading-[0.95] text-white">
            {t("title")}
          </h2>
          <p className="mx-auto mt-7 max-w-3xl text-xl leading-8 text-white/64">
            {t("description")}
          </p>
        </div>

        <div className="mt-20 grid gap-4 lg:grid-cols-4">
          {workflowItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="lf-editorial-card group flex min-h-[24rem] flex-col rounded-[1.35rem] p-6 transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="flex items-center gap-3 text-primary">
                  <Icon className="h-6 w-6" />
                  <span className="font-semibold">{t(`items.${item.key}.title`)}</span>
                </div>
                <div className="mt-8 flex-1 rounded-xl border border-white/10 bg-black/18 p-4">
                  <MiniWorkflowPreview itemKey={item.key} />
                </div>
                <div className="mt-8 border-t border-primary/55 pt-6">
                  <p className="max-w-xs text-xl leading-8 text-white/78">
                    {t(`items.${item.key}.description`)}
                  </p>
                  <span className="mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-black transition-transform group-hover:translate-x-1">
                    <ArrowRight className="h-5 w-5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniWorkflowPreview({ itemKey }: { itemKey: string }) {
  if (itemKey === "review") {
    return (
      <div className="grid h-full grid-cols-2 gap-2">
        {["mirror-portrait.jpg", "studio-vocalist.jpg", "audio-console.jpg", "film-production.jpg"].map(
          (asset) => (
            <div
              key={asset}
              className="rounded-lg bg-cover bg-center"
              style={{
                backgroundImage: `url(/assets/creative-studio/${asset})`,
              }}
            />
          ),
        )}
      </div>
    );
  }

  if (itemKey === "reuse") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <div className="flex aspect-square items-center justify-center rounded-lg bg-primary text-sm font-bold text-black">
            Aa
          </div>
          <div className="rounded-lg bg-white/8" />
          <div className="rounded-lg bg-[url('/assets/creative-studio/mirror-portrait.jpg')] bg-cover bg-center" />
          <div className="rounded-lg bg-[url('/assets/creative-studio/blue-mosaic.jpg')] bg-cover bg-center" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-12 rounded-lg bg-white/10" />
          <div className="h-12 rounded-lg bg-white/10" />
          <div className="h-12 rounded-lg bg-white/10" />
        </div>
      </div>
    );
  }

  if (itemKey === "deliver") {
    return (
      <div className="space-y-4 text-sm text-white/62">
        {["Web 1920 x 1080", "Social 1080 x 1080", "Presentation 16:9"].map(
          (label) => (
            <div key={label} className="flex justify-between border-b border-white/8 pb-3">
              <span>{label.split(" ")[0]}</span>
              <span>{label.replace(label.split(" ")[0], "").trim()}</span>
            </div>
          ),
        )}
        <div className="rounded-lg bg-primary py-3 text-center font-semibold text-black">
          Export project
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 border-b border-white/10 text-center text-xs text-white/70">
        <span className="border-b border-primary py-2 text-primary">Image</span>
        <span className="py-2">Video</span>
        <span className="py-2">Audio</span>
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
