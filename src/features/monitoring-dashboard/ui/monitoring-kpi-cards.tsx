import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { MonitoringStatsChart } from "./monitoring-stats-chart";
import { useMemo, type ReactNode } from "react";
import { Activity, CheckCircle2, Timer } from "lucide-react";
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
import { useLocale, useTranslations } from "next-intl";
import type {
  MonitoringOverview,
  MonitoringStatsRow,
} from "@/features/monitoring-dashboard/model/types";
import {
  formatCompactNumber,
  formatDuration,
  formatPercent,
} from "@/features/monitoring-dashboard/lib/format";
import { AppCard } from "@/shared/ui/app-card";
import {
  AppChartContainer,
  AppChartTooltipContent,
} from "@/shared/ui/app-chart";

interface MonitoringKpiCardsProps {
  data: MonitoringOverview | null;
  stats?: MonitoringStatsRow[];
  isLoading: boolean;
  statsLoading?: boolean;
}

const cardTitle = "text-sm font-semibold text-white/70";
const cardValue =
  "font-sans text-[2.65rem] font-medium leading-none tracking-[-0.02em] text-white tabular-nums";

type KpiChartDatum = {
  day: string;
  value: number;
};

type UsageSlice = {
  name: string;
  value: number;
  color: string;
};

function KpiChart({
  data,
  label,
  chartId,
  formatDay,
  formatValue,
  isLoading,
}: {
  data: KpiChartDatum[];
  isLoading: boolean;
  label: string;
  chartId: string;
  formatDay: (value: string) => string;
  formatValue: (value: number) => string;
}) {
  const t = useTranslations("monitoringDashboard");
  if (isLoading) return <AppSkeleton className="h-28 w-full rounded-lg" />;
  if (!data.length) return <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">{t("stats.empty")}</div>;
  const chartData = data;

  return (
    <AppChartContainer
      aria-label={`${label} chart`}
      className="border-0 bg-transparent p-0"
      data-monitoring-kpi-chart=""
      height={112}
    >
      <AreaChart
        data={chartData}
        margin={{ top: 10, right: 6, bottom: 0, left: -18 }}
      >
        <defs>
          <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#347ff4" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#347ff4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="rgba(255,255,255,0.075)"
          strokeDasharray="3 4"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          tick={{ fill: "#8b8f94", fontSize: 10 }}
          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
          tickLine={false}
          minTickGap={10}
        />
        <YAxis
          tickFormatter={formatValue}
          tick={{ fill: "#8b8f94", fontSize: 10 }}
          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
          tickLine={false}
          width={40}
        />
        <Tooltip
          content={({ active, payload, label: tooltipLabel }) => {
            if (!active || !payload?.length) return null;
            const value = Number(payload[0].value ?? 0);
            return (
              <AppChartTooltipContent
                label={
                  typeof tooltipLabel === "string"
                    ? formatDay(tooltipLabel)
                    : "-"
                }
                rows={[
                  {
                    label,
                    value: formatValue(value),
                    color: "#347ff4",
                  },
                ]}
              />
            );
          }}
          cursor={{ stroke: "rgba(52,127,244,0.3)" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#347ff4"
          strokeWidth={2}
          fill={`url(#${chartId})`}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#347ff4"
          strokeWidth={1}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </AppChartContainer>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  visual,
  footnote,
}: {
  title: string;
  value: string;
  icon: typeof Activity;
  visual?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <AppCard
      variant="editorial-flat"
      radius="lg"
      padding="lg"
      className="relative min-h-[18rem]"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-white/52" />
        <span className={cardTitle}>{title}</span>
      </div>
      <div className="mt-6 flex items-end gap-3">
        <span className={cardValue}>{value}</span>
      </div>
      <div className="mt-4">{visual}</div>
      {footnote ? (
        <div className="mt-3 text-xs font-medium text-white/48">{footnote}</div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-6 bottom-5 h-px bg-white/8" />
    </AppCard>
  );
}

function UsagePieChart({
  usageByType,
  totalLabel,
  labels,
}: {
  usageByType: MonitoringOverview["usageByType"];
  totalLabel: string;
  labels: Record<keyof MonitoringOverview["usageByType"], string>;
}) {
  const safeTotal = Object.values(usageByType).reduce(
    (sum, value) => sum + Math.max(0, value),
    0,
  );
  const chartData: UsageSlice[] =
    safeTotal > 0
      ? [
          {
            name: labels.image,
            value: usageByType.image,
            color: "#347ff4",
          },
          {
            name: labels.video,
            value: usageByType.video,
            color: "rgba(255,255,255,0.72)",
          },
          {
            name: labels.audio,
            value: usageByType.audio,
            color: "rgba(255,255,255,0.22)",
          },
          {
            name: labels.other,
            value: usageByType.other,
            color: "rgba(255,255,255,0.12)",
          },
        ]
      : [
          {
            name: totalLabel,
            value: 1,
            color: "rgba(255,255,255,0.14)",
          },
        ];

  return (
    <div
      className="grid min-h-[8.25rem] grid-cols-[8.25rem_minmax(0,1fr)] items-center gap-4"
      data-monitoring-usage-pie=""
    >
      <AppChartContainer
        aria-label={`${totalLabel} chart`}
        className="h-[8.25rem] w-[8.25rem] border-0 bg-transparent p-0"
        height={132}
      >
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            innerRadius={42}
            outerRadius={60}
            paddingAngle={safeTotal > 0 ? 2 : 0}
            stroke="rgba(0,0,0,0.24)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
            <Label
              value={formatCompactNumber(safeTotal)}
              position="center"
              fill="#ffffff"
              fontSize={18}
              fontWeight={600}
            />
          </Pie>
        </PieChart>
      </AppChartContainer>
      <div className="space-y-2 text-xs font-medium text-white/58">
        {chartData.map((item) => {
          const percent =
            safeTotal > 0 ? Math.round((item.value / safeTotal) * 100) : 0;
          return (
            <div
              key={item.name}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="font-sans text-[0.7rem] text-white/70">
                {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonitoringKpiCards({
  data,
  stats = [],
  statsLoading = false,
  isLoading,
}: MonitoringKpiCardsProps) {
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();

  const totalCount = data ? formatCompactNumber(data.totalCount) : "-";
  const avgLatency = data ? formatDuration(data.avgLatencyMs) : "-";
  const successRateValue = data ? Math.max(0, 1 - data.errorRate) : 0;
  const successRate = data ? formatPercent(successRateValue) : "-";
  const usageByType = data?.usageByType ?? {
    image: 0,
    video: 0,
    audio: 0,
    other: 0,
  };
  const formatDay = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    });
    return (value: string) => {
      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return value;
      return formatter.format(parsed);
    };
  }, [locale]);
  const successData = stats.map((item) => ({
    day: item.day,
    value: Number(((1 - item.errorRate) * 100).toFixed(2)),
  }));
  const latencyData = stats.map((item) => ({
    day: item.day,
    value: Math.max(0, Math.round(item.avgLatencyMs ?? 0)),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title={t("kpi.successRate")}
        value={isLoading ? "..." : successRate}
        icon={CheckCircle2}
        visual={
          <KpiChart
            isLoading={statsLoading}
            data={successData}
            label={t("kpi.successRate")}
            chartId="kpi-success-rate"
            formatDay={formatDay}
            formatValue={(value) => `${Math.round(value)}%`}
          />
        }
      />
      <MonitoringStatsChart data={stats} isLoading={statsLoading} compact />
      <StatCard
        title={t("kpi.avgLatency")}
        value={isLoading ? "..." : avgLatency}
        icon={Timer}
        visual={
          <KpiChart
            isLoading={statsLoading}
            data={latencyData}
            label={t("kpi.avgLatency")}
            chartId="kpi-latency"
            formatDay={formatDay}
            formatValue={formatDuration}
          />
        }
      />
      <StatCard
        title={t("kpi.total")}
        value={isLoading ? "..." : totalCount}
        icon={Activity}
        visual={
          <UsagePieChart
            usageByType={usageByType}
            totalLabel={t("kpi.total")}
            labels={{
              image: t("filters.type.image"),
              video: t("filters.type.video"),
              audio: t("filters.type.audio"),
              other: t("kpi.other"),
            }}
          />
        }
        footnote={
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {t("kpi.usageFootnote")}
          </span>
        }
      />
    </div>
  );
}
