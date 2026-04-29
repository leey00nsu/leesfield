import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  ChartNoAxesCombined,
  Code2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

export function LandingPlatformSection() {
  const t = useTranslations("landing.platform");

  return (
    <section className="px-6 py-20 sm:px-10 lg:py-28">
      <div className="mx-auto grid w-full max-w-[1450px] items-center gap-14 lg:grid-cols-[0.42fr_0.58fr]">
        <div>
          <p className="lf-eyebrow">{t("eyebrow")}</p>
          <h2 className="lf-serif mt-7 text-[clamp(3.5rem,6vw,7rem)] leading-[0.95] text-white">
            {t("title")}
          </h2>
          <p className="mt-8 max-w-xl text-xl leading-8 text-white/68">
            {t("description")}
          </p>
          <Button
            asChild
            variant="hero"
            className="mt-10 h-14 rounded-full px-8 text-base normal-case tracking-normal"
          >
            <Link href="/api-docs">
              {t("cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <DocsCard />
          <ModelCatalogCard />
          <MonitoringCard />
          <UsageCard />
          <WorkflowCard />
        </div>
      </div>
    </section>
  );
}

function DocsCard() {
  return (
    <div className="lf-editorial-card rounded-[1rem] p-6 md:min-h-80">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-3 font-semibold text-white">
          <Code2 className="h-6 w-6 text-primary" />
          Docs
        </p>
        <Link href="/api-docs" className="text-sm text-primary">
          API Reference →
        </Link>
      </div>
      <p className="mt-8 text-lg text-white">Generate image</p>
      <p className="mt-2 text-sm text-white/62">Create high-quality images from text.</p>
      <pre className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-4 text-sm leading-7 text-white/68">
{`POST /v2/image/generate
Content-Type: application/json

{
  "model": "Leesfield V2",
  "prompt": "mountain landscape",
  "aspect_ratio": "16:9"
}`}
      </pre>
    </div>
  );
}

function ModelCatalogCard() {
  const models = [
    ["/assets/creative-studio/studio-vocalist.jpg", "Leesfield V2", "Image"],
    ["/assets/creative-studio/film-production.jpg", "Leesfield Video", "Video"],
    ["/assets/creative-studio/audio-console.jpg", "Leesfield Audio", "Audio"],
  ];

  return (
    <div className="lf-editorial-card rounded-[1rem] p-6 md:min-h-80">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-3 font-semibold text-white">
          <Box className="h-6 w-6 text-primary" />
          Model catalog
        </p>
        <Link href="/model" className="text-sm text-primary">
          View all →
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {models.map(([src, name, type]) => (
          <div key={name} className="grid grid-cols-[6rem_1fr] gap-4">
            <div className="relative h-16 overflow-hidden rounded-lg">
              <Image src={src} alt="" fill sizes="96px" className="object-cover" />
            </div>
            <div>
              <p className="font-semibold text-white">{name}</p>
              <span className="mt-2 inline-flex rounded-md bg-white/8 px-2 py-1 text-xs text-white/72">
                {type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitoringCard() {
  return (
    <div className="lf-editorial-card rounded-[1rem] p-6">
      <p className="flex items-center justify-between font-semibold text-white">
        <span className="flex items-center gap-3">
          <ChartNoAxesCombined className="h-6 w-6 text-primary" />
          Monitoring
        </span>
        <span className="text-sm text-primary">Live ●</span>
      </p>
      <div className="mt-8 grid grid-cols-2 gap-8">
        <div>
          <p className="text-sm text-white/56">Requests</p>
          <p className="mt-2 text-4xl font-semibold text-white">2.4M</p>
        </div>
        <div>
          <p className="text-sm text-white/56">Success rate</p>
          <p className="mt-2 text-4xl font-semibold text-white">99.2%</p>
        </div>
      </div>
      <div className="mt-8 h-20 rounded-lg bg-[linear-gradient(180deg,transparent,oklch(0.78_0.18_121_/_0.16)),repeating-linear-gradient(135deg,transparent_0_14px,oklch(0.78_0.18_121_/_0.16)_15px_16px)]" />
    </div>
  );
}

function UsageCard() {
  return (
    <div className="lf-editorial-card rounded-[1rem] p-6">
      <p className="font-semibold text-white">Usage by model</p>
      <div className="mt-8 flex items-center gap-7">
        <div className="h-28 w-28 rounded-full bg-[conic-gradient(var(--primary)_0_58%,oklch(1_0_0_/_0.75)_58%_70%,oklch(1_0_0_/_0.28)_70%_100%)] p-6">
          <div className="h-full w-full rounded-full bg-background-dark" />
        </div>
        <div className="space-y-3 text-sm text-white/62">
          <p>Leesfield V2 60%</p>
          <p>Leesfield Video 25%</p>
          <p>Leesfield Audio 10%</p>
        </div>
      </div>
    </div>
  );
}

function WorkflowCard() {
  return (
    <div className="lf-editorial-card rounded-[1rem] p-6 md:col-span-2">
      <p className="font-semibold text-white">Workflow</p>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {["Input", "Generate", "Review", "Deploy"].map((label) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/18 p-4"
          >
            <Box className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-white">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
