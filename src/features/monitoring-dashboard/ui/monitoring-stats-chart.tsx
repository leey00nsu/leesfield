import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonitoringStatsRow } from "@/features/monitoring-dashboard/model/types";
import {
  formatCompactNumber,
  formatPercent,
} from "@/features/monitoring-dashboard/lib/format";
import { AppCard } from "@/shared/ui/app-card";
import {
  AppChartContainer,
  AppChartTooltipContent,
} from "@/shared/ui/app-chart";

interface MonitoringStatsChartProps {
  data: MonitoringStatsRow[];
  isLoading: boolean;
  compact?: boolean;
}

type ChartDatum = {
  day: string;
  total: number;
  errorRate: number;
  errorRatePct: number;
};



function ChartTooltip({
  active,
  payload,
  label,
  labels,
  formatDayLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  label?: string;
  labels: { requests: string; errorRate: string };
  formatDayLabel: (value: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <AppChartTooltipContent
      label={label ? formatDayLabel(label) : "-"}
      rows={[
        {
          label: labels.requests,
          value: formatCompactNumber(item.total),
          color: "#347ff4",
        },
        {
          label: labels.errorRate,
          value: formatPercent(item.errorRate),
          color: "#9e8cff",
        },
      ]}
    />
  );
}

export function MonitoringStatsChart({
  data,
  isLoading,
  compact = false,
}: MonitoringStatsChartProps) {
  const chartHeight = compact ? 150 : 260;
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();
  const tooltipLabels = useMemo(
    () => ({
      requests: t("stats.totalLabel"),
      errorRate: t("stats.errorLabel"),
    }),
    [t],
  );
  const formatDayLabel = useMemo(() => {
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

  const chartData = useMemo<ChartDatum[]>(() => {
    return data.map((item) => ({
      day: item.day,
      total: item.total,
      errorRate: item.errorRate,
      errorRatePct: Number((item.errorRate * 100).toFixed(2)),
    }));
  }, [data]);

  const maxTotal = useMemo(
    () =>
      chartData.length ? Math.max(...chartData.map((item) => item.total)) : 0,
    [chartData],
  );
  const maxErrorRate = useMemo(
    () =>
      chartData.length
        ? Math.max(...chartData.map((item) => item.errorRate))
        : 0,
    [chartData],
  );

  return (
    <AppCard variant="editorial-flat" radius="lg" padding="lg">
      <div className="flex flex-col gap-2">
        <div className={compact ? "text-sm font-semibold text-white/70" : "text-xl font-semibold text-white"}>
          {t("stats.title")}
        </div>
        <div className="text-xs font-sans uppercase tracking-widest text-gray-500">
          {t("stats.subtitle")}
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <AppSkeleton style={{ height: chartHeight }} className="w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div style={{height:chartHeight}} className="flex items-center justify-center rounded-xl border border-white/10 bg-transparent text-sm text-gray-400">
            {t("stats.empty")}
          </div>
        ) : (
          <AppChartContainer
            role="img"
            aria-label={t("stats.aria")}
            className="border-0 bg-transparent"
            height={chartHeight}
          >
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="monitoring-area"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#347ff4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#347ff4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="day"
                tickFormatter={formatDayLabel}
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={formatCompactNumber}
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labels={tooltipLabels}
                    formatDayLabel={formatDayLabel}
                  />
                }
                cursor={{ stroke: "rgba(52,127,244,0.3)" }}
              />
              <Area
                yAxisId="left"
                dataKey="total"
                type="monotone"
                stroke="#347ff4"
                strokeWidth={2}
                fill="url(#monitoring-area)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                dataKey="errorRatePct"
                type="monotone"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </AppChartContainer>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-sans text-gray-400">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {t("stats.totalLabel")}
          {chartData.length > 0 && (
            <span className="text-white">{formatCompactNumber(maxTotal)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent-purple" />
          {t("stats.errorLabel")}
          {chartData.length > 0 && (
            <span className="text-white">{formatPercent(maxErrorRate)}</span>
          )}
        </div>
      </div>
    </AppCard>
  );
}
