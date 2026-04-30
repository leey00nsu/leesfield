import { Gauge, ListOrdered } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type {
  MonitoringMetric,
  MonitoringTopItem,
  MonitoringTopResponse,
} from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatDuration, formatPercent } from "@/features/monitoring-dashboard/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { ChartContainer, ChartTooltipContent } from "@/shared/ui/chart";
import { cn } from "@/shared/lib/utils";

interface MonitoringTopListProps {
  data: MonitoringTopResponse | null;
  isLoading: boolean;
  metric: MonitoringMetric;
  onMetricChange: (metric: MonitoringMetric) => void;
}

function resolveMetricValue(item: MonitoringTopItem, metric: MonitoringMetric) {
  if (metric === "latency") {
    return item.p95LatencyMs ?? item.avgLatencyMs ?? 0;
  }
  if (metric === "errors") {
    return item.failed;
  }
  return item.total;
}

function formatMetricValue(item: MonitoringTopItem, metric: MonitoringMetric) {
  if (metric === "latency") {
    return formatDuration(item.p95LatencyMs ?? item.avgLatencyMs);
  }
  if (metric === "errors") {
    return formatCompactNumber(item.failed);
  }
  return formatCompactNumber(item.total);
}

function TopListSection({
  title,
  items,
  metric,
}: {
  title: string;
  items: MonitoringTopItem[];
  metric: MonitoringMetric;
}) {
  const maxValue = useMemo(() => {
    return items.reduce(
      (max, item) => Math.max(max, resolveMetricValue(item, metric)),
      0,
    );
  }, [items, metric]);
  const chartData = useMemo(
    () =>
      items.map((item) => ({
        label: item.label,
        value: resolveMetricValue(item, metric),
        formatted: formatMetricValue(item, metric),
        total: formatCompactNumber(item.total),
        errorRate: formatPercent(item.errorRate),
      })),
    [items, metric],
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-background-dark/60 p-4">
      <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-gray-500">-</div>
        ) : (
          <>
            <ChartContainer className="border-0 bg-transparent p-0" height={148}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 2, right: 8, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide domain={[0, Math.max(maxValue, 1)]} />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  width={96}
                  tick={{ fill: "rgba(255,255,255,0.68)", fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const datum = payload[0].payload as (typeof chartData)[number];
                    return (
                      <ChartTooltipContent
                        label={datum.label}
                        rows={[
                          {
                            label: "Metric",
                            value: datum.formatted,
                            color: "#d4f032",
                          },
                          {
                            label: "Requests / error",
                            value: `${datum.total} / ${datum.errorRate}`,
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  barSize={8}
                  isAnimationActive={false}
                >
                  {chartData.map((item, index) => (
                    <Cell
                      key={`${item.label}-${index}`}
                      fill={index === 0 ? "#d4f032" : "rgba(212,240,50,0.58)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="space-y-2">
              {chartData.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="truncate text-white/42">{item.label}</span>
                  <span className="font-mono text-primary">{item.formatted}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function MonitoringTopList({
  data,
  isLoading,
  metric,
  onMetricChange,
}: MonitoringTopListProps) {
  const t = useTranslations("monitoringDashboard");

  return (
    <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-white">
            {t("top.title")}
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("top.subtitle")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["requests", "errors", "latency"].map((value) => (
            <AppButton
              key={value}
              type="button"
              size="sm"
              variant={metric === value ? "primary" : "surface"}
              className={cn(
                "text-xs font-bold uppercase tracking-widest",
                metric === value ? "text-black" : "text-gray-400",
              )}
              onClick={() => onMetricChange(value as MonitoringMetric)}
            >
              {t(`top.metric.${value}`)}
            </AppButton>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 rounded-xl border border-white/10 bg-background-dark/50" />
      ) : !data ? (
        <div className="mt-6 flex h-48 items-center justify-center rounded-xl border border-white/10 bg-background-dark/50 text-sm text-gray-400">
          {t("top.empty")}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TopListSection
            title={t("top.models")}
            items={data.models}
            metric={metric}
          />
          <TopListSection
            title={t("top.apiKeys")}
            items={data.apiKeys}
            metric={metric}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs font-mono text-gray-500">
        <ListOrdered className="h-4 w-4" />
        {t("top.caption")}
        <Gauge className="h-4 w-4 text-primary" />
      </div>
    </AppCard>
  );
}
