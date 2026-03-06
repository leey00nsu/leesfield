"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import type { MonitoringRequestDetail, MonitoringRequestItem } from "@/features/monitoring-dashboard/model/types";
import { useMonitoringRequestDetail } from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { formatDuration } from "@/features/monitoring-dashboard/lib/format";
import { resolveMonitoringStatus } from "@/features/monitoring-dashboard/lib/monitoring-request-status";

interface MonitoringRequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: MonitoringRequestItem | null;
  timeZone: string;
  detailOverride?: MonitoringRequestDetail | null;
}

const FINISHED_STATUSES = new Set(["completed", "failed"]);

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-background-dark/40 px-3 py-2">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className="text-sm text-white">{value ?? "-"}</span>
    </div>
  );
}

function formatResolution(asset: MonitoringRequestDetail["assets"][number]) {
  if (!asset.width || !asset.height) return null;
  return `${asset.width}x${asset.height}`;
}

export function MonitoringRequestDetailDialog({
  open,
  onOpenChange,
  request,
  timeZone,
  detailOverride = null,
}: MonitoringRequestDetailDialogProps) {
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();
  const statusLabels: Record<string, string> = {
    pending: t("statuses.pending"),
    processing: t("statuses.processing"),
    completed: t("statuses.completed"),
    failed: t("statuses.failed"),
  };

  const shouldFetchDetail = !detailOverride;
  const detailQuery = useMonitoringRequestDetail(
    request?.type ?? null,
    request?.id ?? null,
    open && Boolean(request) && shouldFetchDetail,
  );

  const formatter = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  }, [locale, timeZone]);

  const formatDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return formatter.format(parsed);
  };

  const detail = detailOverride ?? detailQuery.data ?? null;
  const isFinished = detail ? FINISHED_STATUSES.has(detail.status) : false;
  const status = detail
    ? resolveMonitoringStatus(detail.status, statusLabels)
    : null;
  const StatusIcon = status?.icon ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-4xl rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
        <DialogHeader className="gap-2">
          <DialogDescription className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("requests.detailSubtitle")}
          </DialogDescription>
          <DialogTitle className="text-xl font-bold text-white">
            {t("requests.detailTitle")}
          </DialogTitle>
        </DialogHeader>

        {shouldFetchDetail && detailQuery.isLoading ? (
          <div className="mt-6 h-48 rounded-xl border border-white/10 bg-background-dark/50" />
        ) : shouldFetchDetail && detailQuery.error ? (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("requests.detailFetchError")}
          </div>
        ) : detail ? (
          <div className="mt-6 flex flex-col gap-6">
            <div className="grid gap-3 md:grid-cols-3">
              <DetailRow label={t("requests.detailRequestId")} value={detail.id} />
              <DetailRow label={t("requests.detailModel")} value={detail.model ?? "-"} />
              <DetailRow label={t("requests.detailType")} value={detail.type.toUpperCase()} />
              <DetailRow
                label={t("requests.detailStarted")}
                value={formatDateTime(detail.createdAt)}
              />
              <DetailRow
                label={t("requests.detailFinished")}
                value={isFinished ? formatDateTime(detail.updatedAt) : "-"}
              />
              <DetailRow
                label={t("requests.detailDuration")}
                value={formatDuration(detail.durationMs)}
              />
              <DetailRow
                label={t("requests.detailProgress")}
                value={detail.progress !== null ? `${detail.progress}%` : "-"}
              />
              <DetailRow
                label={t("requests.detailStatus")}
                value={
                  status ? (
                    <span className={cn("inline-flex items-center gap-2", status.className)}>
                      {StatusIcon ? <StatusIcon className="h-4 w-4" /> : null}
                      {status.label}
                    </span>
                  ) : (
                    detail.status
                  )
                }
              />
            </div>

            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {t("requests.detailPrompt")}
              </div>
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-background-dark/40 p-4 text-sm text-white">
                {detail.prompt}
              </div>
            </div>

            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {t("requests.detailInputs")}
              </div>
              {detail.inputImages.length === 0 ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-background-dark/40 p-4 text-sm text-gray-400">
                  {t("requests.detailInputsEmpty")}
                </div>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {detail.inputImages.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                    >
                      <img
                        src={url}
                        alt={`input-${index + 1}`}
                        className="h-48 w-full object-contain bg-black/70"
                        loading="lazy"
                      />
                      <div className="px-3 py-2 text-xs text-gray-400">#{index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {t("requests.detailResults")}
              </div>
              {detail.assets.length === 0 ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-background-dark/40 p-4 text-sm text-gray-400">
                  {t("requests.detailEmpty")}
                </div>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {detail.assets.map((asset, index) => {
                    const resolution = formatResolution(asset);
                    return (
                      <div
                        key={`${asset.url}-${index}`}
                        className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                      >
                        {detail.type === "image" ? (
                          <img
                            src={asset.url}
                            alt={`result-${index + 1}`}
                            className="h-48 w-full object-contain bg-black/70"
                            loading="lazy"
                          />
                        ) : detail.type === "audio" ? (
                          <div className="flex h-48 w-full items-center justify-center bg-black/70 p-4">
                            <audio controls className="w-full" src={asset.url} />
                          </div>
                        ) : (
                          <video
                            controls
                            className="h-48 w-full object-contain bg-black/70"
                            src={asset.url}
                          />
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-gray-400">
                          <span>#{index + 1}</span>
                          <span>{resolution ?? "-"}</span>
                          {asset.durationSec ? (
                            <span>{`${asset.durationSec}s`}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {detail.errorMessage ? (
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {t("requests.detailError")}
                </div>
                <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {detail.errorMessage}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="surface">
              {t("requests.detailClose")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
