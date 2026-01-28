import { useMemo } from "react";
import { CheckCircle2, Clock3, ShieldAlert, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MonitoringRequestItem } from "@/features/monitoring-dashboard/model/types";
import { formatDuration } from "@/features/monitoring-dashboard/lib/format";
import { cn } from "@/shared/lib/utils";

interface MonitoringRequestTableProps {
  items: MonitoringRequestItem[];
  isLoading: boolean;
  error: string | null;
  updatedAt: string | null;
  timeZone: string;
}

const statusStyles: Record<
  string,
  { label: string; className: string; icon: typeof Clock3 }
> = {
  pending: {
    label: "Pending",
    className: "text-yellow-400",
    icon: Clock3,
  },
  processing: {
    label: "Processing",
    className: "text-primary",
    icon: Timer,
  },
  completed: {
    label: "Completed",
    className: "text-green-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "text-destructive",
    icon: ShieldAlert,
  },
};

function resolveStatus(status: string, labels: Record<string, string>) {
  const lower = status.toLowerCase();
  const style = statusStyles[lower];
  if (!style) {
    return {
      label: status,
      className: "text-gray-400",
      icon: Clock3,
    };
  }

  const label = labels[lower] ?? style.label;
  return {
    ...style,
    label,
  };
}

export function MonitoringRequestTable({
  items,
  isLoading,
  error,
  updatedAt,
  timeZone,
}: MonitoringRequestTableProps) {
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();
  const formatDateTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
    return (value: string) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "-";
      return formatter.format(parsed);
    };
  }, [locale, timeZone]);
  const statusLabels: Record<string, string> = {
    pending: t("statuses.pending"),
    processing: t("statuses.processing"),
    completed: t("statuses.completed"),
    failed: t("statuses.failed"),
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-surface-dark/80 p-6 shadow-2xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">
            {t("requests.title")}
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("requests.subtitle")}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {updatedAt ? t("requests.updated", { time: formatDateTime(updatedAt) }) : t("requests.updating")}
        </div>
      </div>

      <div className="mt-5 w-full overflow-x-auto">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : isLoading ? (
          <div className="h-48 rounded-xl border border-white/10 bg-background-dark/50" />
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-background-dark/50 text-sm text-gray-400">
            {t("requests.empty")}
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs font-mono uppercase tracking-widest text-gray-500">
                <th className="px-4 py-3">{t("requests.columns.apiKey")}</th>
                <th className="px-4 py-3">{t("requests.columns.model")}</th>
                <th className="px-4 py-3">{t("requests.columns.timestamp")}</th>
                <th className="px-4 py-3">{t("requests.columns.duration")}</th>
                <th className="px-4 py-3 text-right">{t("requests.columns.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item) => {
                const status = resolveStatus(item.status, statusLabels);
                const Icon = status.icon;
                return (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-gray-400">
                      {item.apiKeyLabel}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-400">
                          {item.type}
                        </span>
                        <span>{item.model ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-primary">
                      {formatDuration(item.durationMs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold",
                          status.className,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
