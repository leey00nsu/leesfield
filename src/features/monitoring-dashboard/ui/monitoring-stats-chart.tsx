import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonitoringStatsRow } from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatPercent } from "@/features/monitoring-dashboard/lib/format";

interface MonitoringStatsChartProps {
  data: MonitoringStatsRow[];
  isLoading: boolean;
}

type ChartDatum = {
  day: string;
  total: number;
  errorRate: number;
  errorRatePct: number;
};

const CHART_HEIGHT = 260;

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
    <div className="rounded-xl border border-white/10 bg-background-dark/95 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
        {label ? formatDayLabel(label) : "-"}
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-gray-400">{labels.requests}</span>
        <span className="text-white">{formatCompactNumber(item.total)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-gray-400">{labels.errorRate}</span>
        <span className="text-white">{formatPercent(item.errorRate)}</span>
      </div>
    </div>
  );
}

export function MonitoringStatsChart({
  data,
  isLoading,
}: MonitoringStatsChartProps) {
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
    () => (chartData.length ? Math.max(...chartData.map((item) => item.total)) : 0),
    [chartData],
  );
  const maxErrorRate = useMemo(
    () => (chartData.length ? Math.max(...chartData.map((item) => item.errorRate)) : 0),
    [chartData],
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-surface-dark/80 p-6 shadow-2xl">
      <div className="flex flex-col gap-2">
        <div className="text-lg font-semibold text-white">
          {t("stats.title")}
        </div>
        <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {t("stats.subtitle")}
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="h-[260px] rounded-xl border border-white/10 bg-background-dark/50" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-xl border border-white/10 bg-background-dark/50 text-sm text-gray-400">
            {t("stats.empty")}
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="monitoring-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4f032" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#d4f032" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
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
                  content={<ChartTooltip labels={tooltipLabels} formatDayLabel={formatDayLabel} />}
                  cursor={{ stroke: "rgba(212,240,50,0.3)" }}
                />
                <Area
                  yAxisId="left"
                  dataKey="total"
                  type="monotone"
                  stroke="#d4f032"
                  strokeWidth={2}
                  fill="url(#monitoring-area)"
                />
                <Line
                  yAxisId="right"
                  dataKey="errorRatePct"
                  type="monotone"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono text-gray-400">
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
    </div>
  );
}
