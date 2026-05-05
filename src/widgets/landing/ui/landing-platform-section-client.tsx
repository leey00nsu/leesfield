"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  ChartNoAxesCombined,
  Check,
  Code2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";
import {
  AppChartContainer,
  AppChartTooltipContent,
} from "@/shared/ui/app-chart";

export type LandingPlatformModel = {
  key: string;
  label: string;
  vendor: string;
  provider: string;
  modality: "Image" | "Video" | "Audio";
  asset: string;
};

export type LandingPlatformUsageItem = {
  name: string;
  value: number;
  total: number;
  color: string;
};

export type LandingPlatformMonitoringData = {
  totalCount: number;
  successRate: number | null;
  trend: Array<{
    day: string;
    requests: number;
    errors: number;
  }>;
  usage: LandingPlatformUsageItem[];
};

type LandingPlatformClientSectionProps = {
  featuredModels: LandingPlatformModel[];
  monitoring: LandingPlatformMonitoringData;
};

function formatCompact(value: number) {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function LandingPlatformClientSection({
  featuredModels,
  monitoring,
}: LandingPlatformClientSectionProps) {
  const t = useTranslations("landing.platform");
  const docsModel = featuredModels[0] ?? {
    key: "gpt-image-2",
    label: "GPT Image 2",
    vendor: "OpenAI",
    provider: "codex_bridge",
    modality: "Image" as const,
    asset: "/assets/creative-studio/studio-vocalist.jpg",
  };

  return (
    <section className="px-6 py-16 sm:px-10 lg:py-24">
      <div className="mx-auto grid w-full max-w-[1450px] items-center gap-12 lg:grid-cols-[0.4fr_0.6fr]">
        <div>
          <AppEyebrow>{t("eyebrow")}</AppEyebrow>
          <AppHeading as="h2" size="section" className="mt-6">
            {t("title")}
          </AppHeading>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/68">
            {t("description")}
          </p>
          <AppButton
            asChild
            size="lg"
            className="mt-9 h-12 rounded-full px-7 text-sm font-medium normal-case tracking-normal"
          >
            <Link href="/api-docs">
              {t("cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </AppButton>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <DocsCard model={docsModel} />
          <ModelCatalogCard featuredModels={featuredModels} />
          <MonitoringCard monitoring={monitoring} />
          <UsageCard monitoring={monitoring} />
          <WorkflowCard />
        </div>
      </div>
    </section>
  );
}

function DocsCard({ model }: { model: LandingPlatformModel }) {
  const t = useTranslations("landing.platform.cards");

  return (
    <AppCard
      data-testid="landing-docs-card"
      variant="editorial"
      className="rounded-[1rem] p-5 md:min-h-72"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-3 font-medium text-white">
          <Code2 className="h-5 w-5 text-primary" />
          {t("docs")}
        </p>
        <Link href="/api-docs" className="text-sm text-primary">
          {t("apiReference")}
        </Link>
      </div>
      <p className="mt-7 text-base text-white">{t("generateImage")}</p>
      <p className="mt-2 text-sm text-white/62">
        {t("generateImageDescription")}
      </p>
      <pre className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-4 text-xs leading-6 text-white/68">
{`POST /v2/image/generate
Content-Type: application/json

{
  "model": "${model.key}",
  "prompt": "cinematic product study",
  "aspect_ratio": "16:9"
}`}
      </pre>
    </AppCard>
  );
}

function ModelCatalogCard({
  featuredModels,
}: {
  featuredModels: LandingPlatformModel[];
}) {
  const t = useTranslations("landing.platform.cards");
  const getModalityLabel = (modality: LandingPlatformModel["modality"]) => {
    switch (modality) {
      case "Image":
        return t("modalities.image");
      case "Video":
        return t("modalities.video");
      case "Audio":
        return t("modalities.audio");
    }
  };

  return (
    <AppCard variant="editorial" radius="md" padding="md" className="md:min-h-72">
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-3 font-medium text-white">
          <Box className="h-5 w-5 text-primary" />
          {t("modelCatalog")}
        </p>
        <Link href="/model" className="text-sm text-primary">
          {t("viewAll")}
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {featuredModels.map((model) => (
          <div key={model.key} className="grid grid-cols-[5.25rem_1fr] gap-4">
            <div className="relative h-14 overflow-hidden rounded-lg">
              <Image
                src={model.asset}
                alt=""
                fill
                sizes="84px"
                className="object-cover"
              />
            </div>
            <div>
              <p className="font-medium text-white">{model.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex rounded-md bg-white/8 px-2 py-1 text-xs text-white/72">
                  {getModalityLabel(model.modality)}
                </span>
                <span className="inline-flex rounded-md bg-primary/12 px-2 py-1 text-xs text-primary">
                  {model.vendor}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppCard>
  );
}

function MonitoringCard({
  monitoring,
}: {
  monitoring: LandingPlatformMonitoringData;
}) {
  const t = useTranslations("landing.platform.cards");

  return (
    <AppCard variant="editorial" radius="md" padding="md">
      <p className="flex items-center justify-between font-medium text-white">
        <span className="flex items-center gap-3">
          <ChartNoAxesCombined className="h-5 w-5 text-primary" />
          {t("monitoring")}
        </span>
        <Link href="/monitoring" className="text-sm text-primary">
          {t("viewAll")}
        </Link>
      </p>
      <div className="mt-6 grid grid-cols-2 gap-5">
        <div>
          <p className="text-sm text-white/56">{t("requests")}</p>
          <p className="mt-2 text-2xl font-medium text-white">
            {formatCompact(monitoring.totalCount)}
          </p>
        </div>
        <div>
          <p className="text-sm text-white/56">{t("successRate")}</p>
          <p className="mt-2 text-2xl font-medium text-white">
            {monitoring.successRate === null
              ? t("noData")
              : `${monitoring.successRate}%`}
          </p>
        </div>
      </div>
      <AppChartContainer
        role="img"
        aria-label={t("monitoringTrend")}
        className="mt-6"
        height={128}
      >
        <AreaChart
          data={monitoring.trend}
          margin={{ left: 0, right: 4, top: 8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="landing-monitoring-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4f032" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#d4f032" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#aaa", fontSize: 10 }}
          />
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const datum = payload[0].payload as LandingPlatformMonitoringData["trend"][number];
              return (
                <AppChartTooltipContent
                  label={String(label)}
                  rows={[
                    {
                      label: t("tooltipRequests"),
                      value: datum.requests.toLocaleString(),
                      color: "#d4f032",
                    },
                    {
                      label: t("tooltipErrors"),
                      value: datum.errors.toLocaleString(),
                      color: "#9e8cff",
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            stroke="#d4f032"
            strokeWidth={2}
            fill="url(#landing-monitoring-fill)"
          />
          <Line
            type="monotone"
            dataKey="errors"
            stroke="#9e8cff"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </AppChartContainer>
    </AppCard>
  );
}

function UsageCard({
  monitoring,
}: {
  monitoring: LandingPlatformMonitoringData;
}) {
  const t = useTranslations("landing.platform.cards");
  const usageData = monitoring.usage;

  return (
    <AppCard variant="editorial" radius="md" padding="md">
      <p className="font-medium text-white">{t("usageByModel")}</p>
      <div className="mt-6 grid items-center gap-5 sm:grid-cols-[9rem_1fr] md:grid-cols-1 xl:grid-cols-[9rem_1fr]">
        <AppChartContainer
          role="img"
          aria-label={t("usageDistribution")}
          className="mx-auto w-36 border-0 bg-transparent p-0"
          height={144}
        >
          <PieChart>
            <Pie
              data={usageData}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={66}
              paddingAngle={3}
              stroke="rgba(0,0,0,0.18)"
              strokeWidth={2}
            >
              {usageData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
              <Label
                value={formatCompact(monitoring.totalCount)}
                position="center"
                fill="#fff"
                fontSize={16}
                fontWeight={500}
              />
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const datum = payload[0].payload as LandingPlatformUsageItem;
                return (
                  <AppChartTooltipContent
                    rows={[
                      {
                        label: datum.name,
                        value: `${datum.total.toLocaleString()} (${datum.value}%)`,
                        color: datum.color,
                      },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </AppChartContainer>
        <div className="space-y-3 text-sm text-white/62">
          {usageData.length === 0 ? (
            <p>{t("noRequests")}</p>
          ) : (
            usageData.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                </span>
                <span className="font-medium text-white">{item.value}%</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppCard>
  );
}

function WorkflowCard() {
  const t = useTranslations("landing.platform.cards");
  const steps = [
    { label: t("steps.input.label"), detail: t("steps.input.detail") },
    { label: t("steps.generate.label"), detail: t("steps.generate.detail") },
    { label: t("steps.review.label"), detail: t("steps.review.detail") },
    { label: t("steps.deploy.label"), detail: t("steps.deploy.detail") },
  ];

  return (
    <AppCard variant="editorial" radius="md" padding="md" className="md:col-span-2">
      <p className="font-medium text-white">{t("workflow")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.label} className="relative flex items-center gap-3">
            <div className="flex min-h-16 flex-1 items-center gap-3 rounded-lg border border-white/10 bg-black/18 p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/12 text-primary">
                {index < steps.length - 1 ? (
                  <ArrowRight className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </span>
              <span>
                <span className="block text-sm font-medium text-white">
                  {step.label}
                </span>
                <span className="block text-xs text-white/52">
                  {step.detail}
                </span>
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-5 bg-primary/70 xl:block" />
            ) : null}
          </div>
        ))}
      </div>
    </AppCard>
  );
}
