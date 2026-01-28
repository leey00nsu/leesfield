import { Gauge, ListOrdered } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type {
  MonitoringMetric,
  MonitoringTopItem,
  MonitoringTopResponse,
} from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatDuration, formatPercent } from "@/features/monitoring-dashboard/lib/format";
import { Button } from "@/shared/ui/button";
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

  return (
    <div className="rounded-2xl border border-white/5 bg-background-dark/60 p-4">
      <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-gray-500">-</div>
        ) : (
          items.map((item, index) => {
            const metricValue = resolveMetricValue(item, metric);
            const width = maxValue > 0 ? (metricValue / maxValue) * 100 : 0;
            return (
              <div key={`${item.key}-${index}`} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white">{item.label}</span>
                  <span className="text-xs font-mono text-primary">
                    {formatMetricValue(item, metric)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-black/40">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/40"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-gray-500">
                  {formatCompactNumber(item.total)} {"/"} {formatPercent(item.errorRate)}
                </div>
              </div>
            );
          })
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
    <div className="rounded-2xl border border-white/5 bg-surface-dark/80 p-6 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">
            {t("top.title")}
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("top.subtitle")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["requests", "errors", "latency"].map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={metric === value ? "default" : "surface"}
              className={cn(
                "text-xs font-bold uppercase tracking-widest",
                metric === value ? "text-black" : "text-gray-400",
              )}
              onClick={() => onMetricChange(value as MonitoringMetric)}
            >
              {t(`top.metric.${value}`)}
            </Button>
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
    </div>
  );
}
