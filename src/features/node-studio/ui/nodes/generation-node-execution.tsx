"use client";
import { VariantImage } from "@/shared/media-assets/variant-image";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  History,
  LoaderCircle,
  Play,
  RotateCw,
  Square,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { getMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { cn } from "@/shared/lib/utils";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppButton } from "@/shared/ui/app-button";

import { NodeExecutionApiError } from "../../api/node-execution-api";
import {
  useCancelNodeExecution,
  useNodeExecutions,
  useStartNodeExecution,
} from "../../hook/use-node-executions";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { NodeExecutionMediaType, NodeExecutionStatus } from "../../model/node-execution-types";
import {
  getPrimaryNodeRunReadinessReason,
  type NodeRunReadiness,
} from "../../model/node-run-readiness";

type DisplayStatus = NodeExecutionStatus | "submitting";

const activeStatuses: readonly NodeExecutionStatus[] = ["pending", "processing", "uploading"];

function statusIcon(status: DisplayStatus) {
  if (status === "submitting" || activeStatuses.includes(status as NodeExecutionStatus)) {
    return <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <History className="h-3.5 w-3.5" aria-hidden="true" />;
}

function CompactAssetPreview({ asset }: { asset: MediaAssetDto }) {
  if (asset.type === "image") {
    return (
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10">
        <VariantImage asset={asset} purpose="list" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-primary">
      {asset.type === "video"
        ? <Video className="h-4 w-4" aria-hidden="true" />
        : <AudioLines className="h-4 w-4" aria-hidden="true" />}
    </span>
  );
}

function AssetPreview({ asset, label }: { asset: MediaAssetDto; label: string }) {
  if (asset.type === "image") {
    return (
      <div className="relative aspect-square max-h-64 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <VariantImage asset={asset} alt={label} className="absolute inset-0 h-full w-full object-contain" />
      </div>
    );
  }
  if (asset.type === "video") {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        src={asset.url}
        aria-label={label}
        className="aspect-video max-h-64 w-full rounded-xl border border-white/10 bg-black/30 object-contain"
      />
    );
  }
  return (
    <div className="grid min-h-24 place-items-center rounded-xl border border-white/10 bg-black/30 p-4">
      <audio controls preload="metadata" src={asset.url} aria-label={label} className="w-full" />
    </div>
  );
}

function OutputChoice({
  asset,
  index,
  selected,
  disabled,
  label,
  onSelect,
}: {
  asset: MediaAssetDto;
  index: number;
  selected: boolean;
  disabled: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-black/30 text-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-55",
        selected ? "border-primary ring-1 ring-primary/25" : "border-white/10",
      )}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {asset.type === "image" ? (
        <VariantImage asset={asset} purpose="list" alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : asset.type === "video" ? (
        <Video className="h-5 w-5" aria-hidden="true" />
      ) : (
        <AudioLines className="h-5 w-5" aria-hidden="true" />
      )}
      <span className="sr-only">{index + 1}</span>
    </button>
  );
}

export function GenerationNodeExecution({
  nodeId,
  mediaType,
  prompt,
  modelKey,
  selectedOutputAssetId = null,
  expanded = false,
  runReadiness,
}: {
  nodeId: string;
  mediaType: NodeExecutionMediaType;
  prompt: string;
  modelKey: string | null;
  selectedOutputAssetId?: string | null;
  expanded?: boolean;
  runReadiness?: NodeRunReadiness;
}) {
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const selectNodeOutputAsset = authoring.selectNodeOutputAsset;
  const executions = useNodeExecutions(authoring.graphId, nodeId);
  const execute = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const [localError, setLocalError] = useState<string | null>(null);
  const records = useMemo(
    () => (executions.data ?? []).filter(
      (execution) => execution.executionKind === "generation" && execution.mediaType === mediaType,
    ),
    [executions.data, mediaType],
  );
  const outputAssetIds = useMemo(
    () => Array.from(new Set(records.flatMap((record) => record.outputAssetIds))),
    [records],
  );
  const assetQueries = useQueries({
    queries: outputAssetIds.map((assetId) => ({
      queryKey: mediaAssetKeys.detail(assetId),
      queryFn: ({ signal }: { signal: AbortSignal }) => getMediaAsset(assetId, signal),
      staleTime: 30_000,
    })),
  });
  const assetsById = useMemo(
    () => new Map<string, MediaAssetDto>(
      assetQueries.flatMap((query, index) =>
        query.data?.type === mediaType ? [[outputAssetIds[index], query.data] as const] : [],
      ),
    ),
    [assetQueries, mediaType, outputAssetIds],
  );
  const outputAssets = outputAssetIds.flatMap((assetId) => {
    const asset = assetsById.get(assetId);
    return asset ? [asset] : [];
  });
  const latest = records[0];
  const latestSuccess = records.find(
    (record) => record.status === "completed" && record.outputAssetIds.length > 0,
  );
  const selectedAsset = selectedOutputAssetId ? assetsById.get(selectedOutputAssetId) : null;
  const displayedAsset = selectedAsset ?? (
    latestSuccess?.outputAssetIds.map((assetId) => assetsById.get(assetId)).find(Boolean) ?? null
  );
  const active = latest ? activeStatuses.includes(latest.status) : false;
  const status: DisplayStatus | null = execute.isPending ? "submitting" : (latest?.status ?? null);
  const writable = authoring.writable !== false;
  const effectiveReadiness = runReadiness ?? {
    ready: Boolean(prompt.trim() && modelKey),
    reasons: !modelKey
      ? ["MODEL_REQUIRED" as const]
      : !prompt.trim()
        ? ["PROMPT_REQUIRED" as const]
        : [],
  };
  const blockedReason = getPrimaryNodeRunReadinessReason(effectiveReadiness);
  const runnable = writable && effectiveReadiness.ready && !active;
  const assetLoadError = assetQueries.some((query) => query.isError);
  const errorMessage =
    localError ??
    (latest?.status === "failed" ? latest.errorCode : null) ??
    (executions.isError || assetLoadError ? t("execution.loadError") : null) ??
    (cancel.isError ? t("generationNode.executionError") : null);

  const run = async () => {
    if (!runnable || execute.isPending) return;
    setLocalError(null);
    try {
      const prepare = authoring.prepareNodeExecution ?? authoring.prepareImageNodeExecution;
      const expectedGraphVersion = await prepare();
      await execute.mutateAsync({ graphId: authoring.graphId, nodeId, expectedGraphVersion });
    } catch (error) {
      const code = error instanceof NodeExecutionApiError
        ? error.code
        : error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR";
      const inputLimit =
        error instanceof NodeExecutionApiError &&
        typeof error.details === "object" &&
        error.details !== null &&
        "limit" in error.details &&
        typeof error.details.limit === "number"
          ? error.details.limit
          : 0;
      setLocalError(
        code === "GRAPH_AUTOSAVE_CONFLICT" || code === "GRAPH_VERSION_CONFLICT"
          ? t("execution.saveConflict")
          : code === "GRAPH_AUTOSAVE_ERROR"
            ? t("execution.saveError")
            : code === "NODE_GENERATION_ACTIVE"
              ? t("execution.activeError")
              : code === "NODE_CONFIG_INVALID"
                ? t("execution.configError")
                : code === "NODE_INPUT_SELECTION_REQUIRED"
                  ? t("execution.inputSelectionRequired")
                  : code === "NODE_INPUT_INVALID"
                    ? t("execution.inputInvalid")
                    : code === "NODE_INPUT_UNSUPPORTED"
                      ? t("execution.inputUnsupported")
                      : code === "NODE_INPUT_LIMIT_EXCEEDED"
                        ? t("execution.inputLimitExceeded", { limit: inputLimit })
                        : t("execution.submitError"),
      );
    }
  };

  if (!expanded) {
    return (
      <div
        className="nodrag nopan mt-3 flex min-h-9 items-center justify-between gap-2 border-t border-white/8 pt-3"
        data-generation-section="execution"
      >
        <button
          type="button"
          data-node-run
          className="sr-only"
          tabIndex={-1}
          disabled={!runnable || execute.isPending}
          onClick={() => void run()}
        >
          {t("actions.runNode")}
        </button>
        {status || blockedReason ? (
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-white/48",
              status === "failed" && "text-red-200/85",
              status === "completed" && "text-primary/85",
            )}
            role="status"
            aria-live="polite"
          >
            {status ? statusIcon(status) : <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>{status ? t(`execution.status.${status}`) : t(`execution.blocked.${blockedReason}`)}</span>
          </span>
        ) : <span />}
        {displayedAsset ? <CompactAssetPreview asset={displayedAsset} /> : null}
      </div>
    );
  }

  return (
    <section
      className="nodrag nopan grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
      aria-label={t("execution.title")}
      data-generation-section="execution"
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        {status ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold text-white/60",
              status === "failed" && "text-red-200",
              status === "completed" && "text-primary",
            )}
            role="status"
            aria-live="polite"
          >
            {statusIcon(status)}
            {t(`execution.status.${status}`)}
            {active ? ` · ${latest?.progress ?? 0}%` : null}
          </span>
        ) : blockedReason ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] leading-4 text-white/48" role="status" aria-live="polite">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(`execution.blocked.${blockedReason}`)}
          </span>
        ) : <span />}
        {active && latest ? (
          <AppButton
            type="button"
            variant="surface-muted"
            size="sm"
            disabled={cancel.isPending || !writable}
            onClick={() => cancel.mutate({ graphId: authoring.graphId, nodeId, executionId: latest.executionId })}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {t("actions.cancel")}
          </AppButton>
        ) : (
          <AppButton
            type="button"
            variant="primary"
            size="sm"
            data-node-run
            disabled={!runnable || execute.isPending}
            aria-busy={execute.isPending}
            onClick={() => void run()}
          >
            {latest ? <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {latest ? t("actions.rerunNode") : t("actions.runNode")}
          </AppButton>
        )}
      </div>

      {active ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={latest?.progress ?? 0}>
          <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${latest?.progress ?? 0}%` }} />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-300/15 bg-red-300/5 px-3 py-2 text-[11px] leading-5 text-red-100" role="alert">
          <span>{errorMessage}</span>
          <AppButton type="button" variant="ghost" size="pill-sm" disabled={!runnable} onClick={() => void run()}>
            {t("actions.retry")}
          </AppButton>
        </div>
      ) : null}

      {displayedAsset ? (
        <div className="grid gap-2">
          <AssetPreview asset={displayedAsset} label={t("execution.latestResult")} />
          {outputAssets.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t("execution.outputs")}>
              {outputAssets.map((asset, index) => (
                <OutputChoice
                  key={asset.id}
                  asset={asset}
                  index={index}
                  selected={asset.id === (selectedOutputAssetId ?? displayedAsset.id)}
                  disabled={!writable || !selectNodeOutputAsset}
                  label={t("execution.selectOutput", { index: index + 1 })}
                  onSelect={() => selectNodeOutputAsset?.(nodeId, asset.id)}
                />
              ))}
            </div>
          ) : null}
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-white/60">
              {t("execution.history", { count: records.length })}
            </summary>
            <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto pr-1">
              {records.map((record) => (
                <div key={record.executionId} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 px-2.5 py-2 text-[10px] text-white/45">
                  <span className="truncate">{record.modelKey ?? t("node.modelUnselected")}</span>
                  <span>{t(`execution.status.${record.status}`)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
