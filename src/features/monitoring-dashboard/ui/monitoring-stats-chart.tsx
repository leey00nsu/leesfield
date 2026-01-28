import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { MonitoringStatsRow } from "@/features/monitoring-dashboard/model/types";
import { formatShortDate, formatCompactNumber, formatPercent } from "@/features/monitoring-dashboard/lib/format";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 260;
const PADDING_X = 36;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 36;

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
}

function buildAreaPath(
  points: Array<{ x: number; y: number }>,
  height: number,
) {
  if (points.length === 0) return "";
  const last = points[points.length - 1];
  const first = points[0];
  const bottom = height - PADDING_BOTTOM;
  return `${buildPath(points)} L${last.x},${bottom} L${first.x},${bottom} Z`;
}

function getTickIndexes(length: number) {
  if (length <= 1) return [0];
  const indexes = new Set<number>();
  indexes.add(0);
  indexes.add(length - 1);
  if (length > 4) {
    indexes.add(Math.floor((length - 1) / 2));
    indexes.add(Math.floor((length - 1) / 3));
  }
  return Array.from(indexes).sort((a, b) => a - b);
}

interface MonitoringStatsChartProps {
  data: MonitoringStatsRow[];
  isLoading: boolean;
}

export function MonitoringStatsChart({
  data,
  isLoading,
}: MonitoringStatsChartProps) {
  const t = useTranslations("monitoringDashboard");

  const chartData = useMemo(() => {
    if (!data.length) return [];
    const maxTotal = Math.max(...data.map((item) => item.total), 1);
    const maxError = Math.max(...data.map((item) => item.errorRate), 0.01);
    const plotWidth = CHART_WIDTH - PADDING_X * 2;
    const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    return data.map((item, index) => {
      const x =
        PADDING_X +
        (plotWidth * (data.length === 1 ? 0 : index / (data.length - 1)));
      const totalRatio = item.total / maxTotal;
      const errorRatio = item.errorRate / maxError;
      const yTotal = PADDING_TOP + plotHeight * (1 - totalRatio);
      const yError = PADDING_TOP + plotHeight * (1 - errorRatio);
      return {
        ...item,
        x,
        yTotal,
        yError,
        maxTotal,
        maxError,
      };
    });
  }, [data]);

  const totalPath = buildPath(chartData.map((item) => ({ x: item.x, y: item.yTotal })));
  const totalAreaPath = buildAreaPath(
    chartData.map((item) => ({ x: item.x, y: item.yTotal })),
    CHART_HEIGHT,
  );
  const errorPath = buildPath(chartData.map((item) => ({ x: item.x, y: item.yError })));
  const ticks = getTickIndexes(chartData.length);

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
          <div className="relative">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="h-[260px] w-full"
              role="img"
              aria-label={t("stats.aria")}
            >
              <defs>
                <linearGradient id="monitoring-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d4f032" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#d4f032" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect
                x={PADDING_X}
                y={PADDING_TOP}
                width={CHART_WIDTH - PADDING_X * 2}
                height={CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4 4"
              />
              <path d={totalAreaPath} fill="url(#monitoring-area)" />
              <path d={totalPath} fill="none" stroke="#d4f032" strokeWidth="2" />
              <path
                d={errorPath}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              {ticks.map((index) => {
                const item = chartData[index];
                return (
                  <g key={`tick-${item.day}`}>
                    <circle cx={item.x} cy={item.yTotal} r="3" fill="#d4f032" />
                  </g>
                );
              })}
            </svg>
            <div className="mt-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-gray-500">
              {ticks.map((index) => {
                const item = chartData[index];
                return <span key={`label-${item.day}`}>{formatShortDate(item.day)}</span>;
              })}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono text-gray-400">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {t("stats.totalLabel")}
          {chartData.length > 0 && (
            <span className="text-white">
              {formatCompactNumber(chartData[chartData.length - 1].maxTotal)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent-purple" />
          {t("stats.errorLabel")}
          {chartData.length > 0 && (
            <span className="text-white">
              {formatPercent(chartData[chartData.length - 1].maxError)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
