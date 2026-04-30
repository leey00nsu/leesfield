import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  MonitoringOverview,
  MonitoringStatsRow,
} from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatDuration, formatPercent } from "@/features/monitoring-dashboard/lib/format";
import { resolveErrorRateHealth } from "@/features/monitoring-dashboard/lib/monitoring-health";
import { cn } from "@/shared/lib/utils";
import { AppCard } from "@/shared/ui/app-card";

interface MonitoringKpiCardsProps {
  data: MonitoringOverview | null;
  stats?: MonitoringStatsRow[];
  isLoading: boolean;
}

const cardTitle = "text-sm font-semibold text-white/70";
const cardValue = "font-serif text-[2.65rem] font-normal leading-none text-white";

function Sparkline({
  values,
  variant = "line",
}: {
  values: number[];
  variant?: "line" | "bars";
}) {
  const normalized = values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...normalized, 1);

  if (variant === "bars") {
    return (
      <div className="flex h-10 items-end gap-1">
        {normalized.slice(-22).map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="w-1.5 rounded-full bg-primary/85 shadow-[0_0_14px_rgba(212,240,50,0.18)]"
            style={{ height: `${Math.max(18, (value / max) * 100)}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-10 items-center gap-1">
      {normalized.slice(-30).map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="h-1 flex-1 rounded-full bg-primary/75"
          style={{
            opacity: 0.32 + (value / max) * 0.58,
            transform: `translateY(${(0.5 - value / max) * 14}px)`,
          }}
        />
      ))}
    </div>
  );
}

function DonutMeter({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className="grid h-24 w-24 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#d4f032 ${safeValue * 3.6}deg, rgba(255,255,255,0.12) 0deg)`,
      }}
      aria-hidden="true"
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#10110f] text-sm font-semibold text-white">
        {Math.round(safeValue)}%
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  visual,
  hintClassName,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  visual?: ReactNode;
  hintClassName?: string;
}) {
  return (
    <AppCard
      variant="editorial-flat"
      className="relative min-h-[13.75rem] rounded-[1.1rem] p-6"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-white/52" />
        <span className={cardTitle}>{title}</span>
      </div>
      <div className="mt-8 flex items-end gap-3">
        <span className={cardValue}>{value}</span>
        {hint ? (
          <span className={cn("pb-1 text-sm font-semibold text-primary", hintClassName)}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-5">{visual}</div>
      <div className="pointer-events-none absolute inset-x-6 bottom-5 h-px bg-white/8" />
    </AppCard>
  );
}

function UsageCard({
  title,
  value,
  hint,
  percent,
}: {
  title: string;
  value: string;
  hint: string;
  percent: number;
}) {
  return (
    <AppCard
      variant="editorial-flat"
      className="relative min-h-[13.75rem] rounded-[1.1rem] p-6"
    >
      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-white/52" />
        <span className={cardTitle}>{title}</span>
      </div>
      <div className="mt-6 flex items-center gap-7">
        <DonutMeter value={percent} />
        <div>
          <div className={cardValue}>{value}</div>
          <div className="mt-3 text-sm font-semibold text-white/42">{hint}</div>
        </div>
      </div>
    </AppCard>
  );
}

export function MonitoringKpiCards({
  data,
  stats = [],
  isLoading,
}: MonitoringKpiCardsProps) {
  const t = useTranslations("monitoringDashboard");

  const activeCount = data ? formatCompactNumber(data.activeCount) : "-";
  const totalCount = data ? formatCompactNumber(data.totalCount) : "-";
  const avgLatency = data ? formatDuration(data.avgLatencyMs) : "-";
  const successRateValue = data ? Math.max(0, 1 - data.errorRate) : 0;
  const successRate = data ? formatPercent(successRateValue) : "-";
  const errorHealth = resolveErrorRateHealth(data?.errorRate ?? 0);
  const totalValues = stats.map((item) => item.total);
  const latencyValues = stats.map((item) => item.avgLatencyMs ?? 0);
  const usagePercent = data?.totalCount
    ? Math.max(
        8,
        Math.min(
          96,
          (data.totalCount / Math.max(data.totalCount + data.activeCount, 1)) * 100,
        ),
      )
    : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title={t("kpi.successRate")}
        value={isLoading ? "..." : successRate}
        hint={t(errorHealth.labelKey)}
        icon={CheckCircle2}
        visual={<Sparkline values={stats.map((item) => 1 - item.errorRate)} />}
        hintClassName={errorHealth.hintClassName}
      />
      <StatCard
        title={t("kpi.active")}
        value={isLoading ? "..." : activeCount}
        hint={t("kpi.vsRange")}
        icon={BarChart3}
        visual={<Sparkline values={totalValues} variant="bars" />}
      />
      <StatCard
        title={t("kpi.avgLatency")}
        value={isLoading ? "..." : avgLatency}
        hint={t("kpi.avgLabel")}
        icon={Timer}
        visual={<Sparkline values={latencyValues} />}
      />
      <UsageCard
        title={t("kpi.apiUsage")}
        value={isLoading ? "..." : totalCount}
        hint={t("kpi.requestsInRange")}
        percent={usagePercent}
      />
    </div>
  );
}
