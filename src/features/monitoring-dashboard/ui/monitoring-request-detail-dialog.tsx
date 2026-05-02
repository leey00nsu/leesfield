"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
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

function resolveInputLabels(
  detail: MonitoringRequestDetail,
  t: ReturnType<typeof useTranslations<"monitoringDashboard">>,
) {
  if (detail.type === "audio") {
    return {
      title: t("requests.detailAudioInputs"),
      empty: t("requests.detailAudioInputsEmpty"),
    };
  }

  return {
    title: t("requests.detailInputs"),
    empty: t("requests.detailInputsEmpty"),
  };
}

function mergeAssets(
  fetchedAssets: MonitoringRequestDetail["assets"] | undefined,
  seedAssets: MonitoringRequestDetail["assets"] | undefined,
) {
  const resolvedFetchedAssets = fetchedAssets ?? [];
  const resolvedSeedAssets = seedAssets ?? [];
  const assetCount = Math.max(resolvedFetchedAssets.length, resolvedSeedAssets.length);

  return Array.from({ length: assetCount }, (_, index) => {
    const fetchedAsset = resolvedFetchedAssets[index];
    const seedAsset = resolvedSeedAssets[index];
    const url = fetchedAsset?.url ?? seedAsset?.url;

    if (!url) return null;

    return {
      url,
      width: fetchedAsset?.width ?? seedAsset?.width ?? null,
      height: fetchedAsset?.height ?? seedAsset?.height ?? null,
      durationSec: fetchedAsset?.durationSec ?? seedAsset?.durationSec ?? null,
    };
  }).filter((asset): asset is NonNullable<typeof asset> => asset !== null);
}

function mergeMonitoringDetail({
  request,
  seed,
  fetched,
}: {
  request: MonitoringRequestItem | null;
  seed: MonitoringRequestDetail | null;
  fetched: MonitoringRequestDetail | null;
}): MonitoringRequestDetail | null {
  if (!seed && !fetched) {
    return null;
  }

  const type = fetched?.type ?? seed?.type ?? request?.type ?? null;
  const id = fetched?.id ?? seed?.id ?? request?.id ?? null;
  const status = fetched?.status ?? seed?.status ?? request?.status ?? null;
  const createdAt = fetched?.createdAt ?? seed?.createdAt ?? request?.createdAt ?? null;

  if (!type || !id || !status || !createdAt) {
    return null;
  }

  const fetchedInputImages = fetched?.inputImages ?? [];
  const seedInputImages = seed?.inputImages ?? [];
  const fetchedInputAudios = fetched?.inputAudios ?? [];
  const seedInputAudios = seed?.inputAudios ?? [];

  return {
    id,
    type,
    status,
    model: fetched?.model ?? seed?.model ?? null,
    prompt: fetched?.prompt ?? seed?.prompt ?? "",
    createdAt,
    updatedAt: fetched?.updatedAt ?? seed?.updatedAt ?? createdAt,
    durationMs: fetched?.durationMs ?? seed?.durationMs ?? request?.durationMs ?? null,
    progress: fetched?.progress ?? seed?.progress ?? null,
    errorMessage: fetched?.errorMessage ?? seed?.errorMessage ?? null,
    warningMessage: fetched?.warningMessage ?? seed?.warningMessage ?? null,
    inputImages: fetchedInputImages.length > 0 ? fetchedInputImages : seedInputImages,
    inputAudios: fetchedInputAudios.length > 0 ? fetchedInputAudios : seedInputAudios,
    referenceText: fetched?.referenceText ?? seed?.referenceText ?? null,
    assets: mergeAssets(fetched?.assets, seed?.assets),
  };
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

  const shouldFetchDetail = Boolean(request);
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

  const detail = useMemo(
    () =>
      mergeMonitoringDetail({
        request,
        seed: detailOverride,
        fetched: detailQuery.data ?? null,
      }),
    [detailOverride, detailQuery.data, request],
  );
  const isFinished = detail ? FINISHED_STATUSES.has(detail.status) : false;
  const status = detail
    ? resolveMonitoringStatus(detail.status, statusLabels)
    : null;
  const StatusIcon = status?.icon ?? null;
  const inputLabels = detail ? resolveInputLabels(detail, t) : null;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="w-[calc(100%-2rem)] max-w-4xl rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
        <AppDialogHeader className="gap-2">
          <AppDialogDescription className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("requests.detailSubtitle")}
          </AppDialogDescription>
          <AppDialogTitle className="text-xl font-bold text-white">
            {t("requests.detailTitle")}
          </AppDialogTitle>
        </AppDialogHeader>

        {shouldFetchDetail && detailQuery.isLoading && !detail ? (
          <div
            data-testid="monitoring-detail-loading"
            className="mt-6 h-48 rounded-xl border border-white/10 bg-background-dark/50"
          />
        ) : shouldFetchDetail && detailQuery.error && !detail ? (
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
                {inputLabels?.title ?? t("requests.detailInputs")}
              </div>
              {detail.inputImages.length === 0 &&
              detail.inputAudios.length === 0 &&
              !detail.referenceText ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-background-dark/40 p-4 text-sm text-gray-400">
                  {inputLabels?.empty ?? t("requests.detailInputsEmpty")}
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
                  {detail.inputAudios.map((url, index) => (
                    <div
                      key={`${url}-audio-${index}`}
                      className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                    >
                      <div className="flex h-48 w-full items-center justify-center bg-black/70 p-4">
                        <audio controls className="w-full" src={url} />
                      </div>
                      <div className="px-3 py-2 text-xs text-gray-400">#{index + 1}</div>
                    </div>
                  ))}
                  {detail.referenceText ? (
                    <div className="rounded-xl border border-white/10 bg-background-dark/40 p-4 text-sm text-white sm:col-span-2">
                      {detail.referenceText}
                    </div>
                  ) : null}
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

            {detail.warningMessage ? (
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {t("requests.detailWarning")}
                </div>
                <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                  {detail.warningMessage}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <AppDialogClose asChild>
            <AppButton type="button" variant="surface">
              {t("requests.detailClose")}
            </AppButton>
          </AppDialogClose>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
