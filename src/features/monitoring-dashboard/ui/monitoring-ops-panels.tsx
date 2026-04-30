import {
  AlertTriangle,
  Database,
  HeartPulse,
  ListChecks,
  Server,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
import { cn } from "@/shared/lib/utils";

type ServiceState = {
  key: string;
  healthy: boolean;
};

export function MonitoringServiceStatusPanel({
  states,
}: {
  states: ServiceState[];
}) {
  const t = useTranslations("monitoringDashboard");

  return (
    <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
      <div className="flex items-center gap-3">
        <Server className="h-5 w-5 text-white/52" />
        <h2 className="text-xl font-semibold text-white">
          {t("ops.serviceStatus")}
        </h2>
      </div>
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="space-y-3">
          {states.map((state) => (
            <div
              key={state.key}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="text-white/76">{t(`ops.services.${state.key}`)}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 font-semibold",
                  state.healthy ? "text-white/70" : "text-amber-200",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    state.healthy ? "bg-primary" : "bg-amber-300",
                  )}
                />
                {state.healthy ? t("ops.operational") : t("ops.degraded")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppCard>
  );
}

export function MonitoringAlertsPanel({
  overview,
  hasDataIssue,
}: {
  overview: MonitoringOverview | null;
  hasDataIssue: boolean;
}) {
  const t = useTranslations("monitoringDashboard");
  const alerts = [];

  if (hasDataIssue) {
    alerts.push({
      title: t("ops.alerts.dataIssue"),
      description: t("ops.alerts.dataIssueDescription"),
      meta: t("ops.now"),
      tone: "warning",
    });
  }
  if ((overview?.errorRate ?? 0) > 0) {
    alerts.push({
      title: t("ops.alerts.errorRate"),
      description: t("ops.alerts.errorRateDescription", {
        value: formatPercent(overview?.errorRate ?? 0),
      }),
      meta: t("ops.range"),
      tone: "warning",
    });
  }
  if ((overview?.activeCount ?? 0) > 0) {
    alerts.push({
      title: t("ops.alerts.queue"),
      description: t("ops.alerts.queueDescription", {
        value: formatCompactNumber(overview?.activeCount ?? 0),
      }),
      meta: t("ops.live"),
      tone: "normal",
    });
  }

  const visibleAlerts =
    alerts.length > 0
      ? alerts
      : [
          {
            title: t("ops.alerts.nominal"),
            description: t("ops.alerts.nominalDescription"),
            meta: t("ops.live"),
            tone: "normal",
          },
        ];

  return (
    <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
          <h2 className="text-xl font-semibold text-white">{t("ops.alertsTitle")}</h2>
        </div>
        <span className="text-sm font-semibold text-white/68">
          {t("ops.viewAll")}
        </span>
      </div>
      <div className="mt-5 divide-y divide-white/8 border-t border-white/10">
        {visibleAlerts.map((alert) => (
          <div
            key={`${alert.title}-${alert.meta}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-4"
          >
            <span
              className={cn(
                "mt-1 h-3 w-3 rounded-full",
                alert.tone === "warning" ? "bg-amber-300" : "bg-primary",
              )}
            />
            <div className="min-w-0">
              <div className="font-semibold text-white/86">{alert.title}</div>
              <div className="mt-1 text-sm text-white/45">{alert.description}</div>
            </div>
            <span className="text-sm text-white/38">{alert.meta}</span>
          </div>
        ))}
      </div>
    </AppCard>
  );
}

function MeterBars({ value }: { value: number }) {
  const activeBars = Math.max(0, Math.min(12, Math.round((value / 100) * 12)));
  return (
    <div className="flex items-end gap-2">
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-11 w-3 rounded-full",
            index < activeBars ? "bg-primary" : "bg-white/14",
          )}
        />
      ))}
    </div>
  );
}

function MiniTrend({ values }: { values: number[] }) {
  const safeValues = values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...safeValues, 1);
  return (
    <div className="flex h-12 flex-1 items-center gap-1">
      {safeValues.slice(-28).map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="h-1 flex-1 rounded-full bg-primary/70"
          style={{
            opacity: 0.3 + (value / max) * 0.6,
            transform: `translateY(${(0.5 - value / max) * 18}px)`,
          }}
        />
      ))}
    </div>
  );
}

export function MonitoringOpsSummaryCards({
  overview,
  stats,
  modelCount,
}: {
  overview: MonitoringOverview | null;
  stats: MonitoringStatsRow[];
  modelCount: number;
}) {
  const t = useTranslations("monitoringDashboard");
  const successRate = Math.max(0, 1 - (overview?.errorRate ?? 0));
  const modelHealth = Math.round(successRate * 100);
  const activeCount = overview?.activeCount ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
        <div className="flex items-center gap-3">
          <HeartPulse className="h-5 w-5 text-white/52" />
          <h2 className="text-lg font-semibold text-white">{t("ops.modelHealth")}</h2>
        </div>
        <div className="mt-7 flex items-center justify-between gap-6">
          <div>
            <div className="font-serif text-4xl text-white">
              {formatPercent(successRate)}
            </div>
            <div className="mt-2 text-sm font-semibold text-white/42">
              {t("ops.modelsCount", { count: modelCount })}
            </div>
          </div>
          <MeterBars value={modelHealth} />
        </div>
      </AppCard>

      <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-white/52" />
          <h2 className="text-lg font-semibold text-white">{t("ops.storageStatus")}</h2>
        </div>
        <div className="mt-7">
          <div className="font-serif text-4xl text-white">
            {formatCompactNumber(overview?.totalCount ?? 0)}
          </div>
          <div className="mt-2 text-sm font-semibold text-white/42">
            {t("ops.requestsInRange")}
          </div>
          <div className="mt-6 h-3 rounded-full bg-white/12">
            <div
              className="h-3 rounded-full bg-primary"
              style={{ width: `${Math.max(8, modelHealth)}%` }}
            />
          </div>
        </div>
      </AppCard>

      <AppCard variant="editorial-flat" className="rounded-[1.1rem] p-6">
        <div className="flex items-center gap-3">
          <ListChecks className="h-5 w-5 text-white/52" />
          <h2 className="text-lg font-semibold text-white">{t("ops.queueActivity")}</h2>
        </div>
        <div className="mt-7 flex items-center gap-8">
          <div className="min-w-24">
            <div className="font-serif text-4xl text-white">
              {formatCompactNumber(activeCount)}
            </div>
            <div className="mt-2 text-sm font-semibold text-white/42">
              {t("ops.jobsInQueue")}
            </div>
            <div className="mt-4 text-sm font-semibold text-primary">
              {formatDuration(overview?.p95LatencyMs ?? overview?.avgLatencyMs ?? null)}
            </div>
          </div>
          <MiniTrend values={stats.map((item) => item.total)} />
        </div>
      </AppCard>
    </div>
  );
}
