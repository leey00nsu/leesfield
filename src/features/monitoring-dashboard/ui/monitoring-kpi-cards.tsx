import { Activity, AlertTriangle, BarChart3, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MonitoringOverview } from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatDuration, formatPercent } from "@/features/monitoring-dashboard/lib/format";
import { cn } from "@/shared/lib/utils";

interface MonitoringKpiCardsProps {
  data: MonitoringOverview | null;
  isLoading: boolean;
}

const cardBase =
  "relative overflow-hidden rounded-2xl border border-white/5 bg-surface-dark/80 p-5 transition-all hover:border-white/10";

const cardTitle = "text-xs font-mono font-bold uppercase tracking-widest text-gray-500";
const cardValue = "text-3xl font-semibold text-white";

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  iconClassName?: string;
}) {
  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <span className={cardTitle}>{title}</span>
        <Icon className={cn("h-5 w-5 text-primary", iconClassName)} />
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className={cardValue}>{value}</span>
        {hint ? (
          <span className="text-xs font-mono text-primary">{hint}</span>
        ) : null}
      </div>
      <div className="pointer-events-none absolute -right-3 -bottom-6 text-white/5">
        <Icon className="h-20 w-20" />
      </div>
    </div>
  );
}

export function MonitoringKpiCards({
  data,
  isLoading,
}: MonitoringKpiCardsProps) {
  const t = useTranslations("monitoringDashboard");

  const activeCount = data ? formatCompactNumber(data.activeCount) : "-";
  const totalCount = data ? formatCompactNumber(data.totalCount) : "-";
  const avgLatency = data ? formatDuration(data.avgLatencyMs) : "-";
  const errorRate = data ? formatPercent(data.errorRate) : "-";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title={t("kpi.active")}
        value={isLoading ? "..." : activeCount}
        hint={t("kpi.live")}
        icon={Activity}
      />
      <StatCard
        title={t("kpi.avgLatency")}
        value={isLoading ? "..." : avgLatency}
        hint={t("kpi.avgLabel")}
        icon={Timer}
        iconClassName="text-accent-purple"
      />
      <StatCard
        title={t("kpi.total")}
        value={isLoading ? "..." : totalCount}
        hint={t("kpi.range")}
        icon={BarChart3}
        iconClassName="text-blue-400"
      />
      <StatCard
        title={t("kpi.errorRate")}
        value={isLoading ? "..." : errorRate}
        hint={t("kpi.errorLabel")}
        icon={AlertTriangle}
        iconClassName="text-destructive"
      />
    </div>
  );
}
