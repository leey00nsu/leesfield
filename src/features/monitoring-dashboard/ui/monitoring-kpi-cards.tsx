import { useMemo, type ReactNode } from "react";
import { Activity, BarChart3, CheckCircle2, Timer } from "lucide-react";
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
}: {
  data: KpiChartDatum[];
  label: string;
  chartId: string;
  formatDay: (value: string) => string;
  formatValue: (value: number) => string;
}) {
  const chartData =
    data.length > 0
      ? data
      : Array.from({ length: 7 }, (_, index) => ({
          day: `${index + 1}`,
          value: 0,
        }));

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
            <stop offset="0%" stopColor="#d4f032" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#d4f032" stopOpacity={0.02} />
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
                  typeof tooltipLabel === "string" ? formatDay(tooltipLabel) : "-"
                }
                rows={[
                  {
                    label,
                    value: formatValue(value),
                    color: "#d4f032",
                  },
                ]}
              />
            );
          }}
          cursor={{ stroke: "rgba(212,240,50,0.3)" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#d4f032"
          strokeWidth={2}
          fill={`url(#${chartId})`}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#d4f032"
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
  total,
  failed,
  totalLabel,
  successfulLabel,
  failedLabel,
}: {
  total: number;
  failed: number;
  totalLabel: string;
  successfulLabel: string;
  failedLabel: string;
}) {
  const safeTotal = Math.max(0, total);
  const safeFailed = Math.max(0, Math.min(failed, safeTotal));
  const successful = Math.max(0, safeTotal - safeFailed);
  const chartData: UsageSlice[] =
    safeTotal > 0
      ? [
          {
            name: successfulLabel,
            value: successful,
            color: "#d4f032",
          },
          {
            name: failedLabel,
            value: safeFailed,
            color: "rgba(255,255,255,0.22)",
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
            <div key={item.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="font-mono text-[0.7rem] text-white/70">
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
  isLoading,
}: MonitoringKpiCardsProps) {
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();

  const activeCount = data ? formatCompactNumber(data.activeCount) : "-";
  const totalCount = data ? formatCompactNumber(data.totalCount) : "-";
  const avgLatency = data ? formatDuration(data.avgLatencyMs) : "-";
  const successRateValue = data ? Math.max(0, 1 - data.errorRate) : 0;
  const successRate = data ? formatPercent(successRateValue) : "-";
  const failedCount = data?.failedCount ?? 0;
  const rawTotalCount = data?.totalCount ?? 0;
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
  const totalData = stats.map((item) => ({
    day: item.day,
    value: item.total,
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
            data={successData}
            label={t("kpi.successRate")}
            chartId="kpi-success-rate"
            formatDay={formatDay}
            formatValue={(value) => `${Math.round(value)}%`}
          />
        }
      />
      <StatCard
        title={t("kpi.active")}
        value={isLoading ? "..." : activeCount}
        icon={BarChart3}
        visual={
          <KpiChart
            data={totalData}
            label={t("kpi.active")}
            chartId="kpi-active"
            formatDay={formatDay}
            formatValue={formatCompactNumber}
          />
        }
      />
      <StatCard
        title={t("kpi.avgLatency")}
        value={isLoading ? "..." : avgLatency}
        icon={Timer}
        visual={
          <KpiChart
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
            total={rawTotalCount}
            failed={failedCount}
            totalLabel={t("kpi.total")}
            successfulLabel={t("kpi.successful")}
            failedLabel={t("kpi.failed")}
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
