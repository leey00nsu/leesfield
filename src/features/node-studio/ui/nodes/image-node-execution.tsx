"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  History,
  LoaderCircle,
  Play,
  RotateCw,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";

import { NodeGenerationApiError } from "../../api/node-generation-api";
import {
  useExecuteNodeGeneration,
  useNodeGenerations,
} from "../../hook/use-node-generations";
import type { ImageGenerationNodeConfigDto } from "../../model/graph-types";
import type { NodeGenerationStatus } from "../../model/node-generation-types";
import { useNodeAuthoring } from "../../model/node-authoring-context";

type DisplayStatus = NodeGenerationStatus | "idle" | "submitting";

const activeStatuses: readonly NodeGenerationStatus[] = [
  "pending",
  "processing",
];

function statusIcon(status: DisplayStatus) {
  if (status === "submitting" || status === "pending" || status === "processing") {
    return <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <History className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function ImageNodeExecution({
  nodeId,
  config,
  selectedOutputImageId,
  expanded = false,
}: {
  nodeId: string;
  config: ImageGenerationNodeConfigDto;
  selectedOutputImageId: string | null;
  expanded?: boolean;
}) {
  const t = useTranslations("nodeStudio");
  const {
    graphId,
    prepareImageNodeExecution,
    selectImageNodeOutput,
  } = useNodeAuthoring();
  const generations = useNodeGenerations(graphId, nodeId);
  const execute = useExecuteNodeGeneration();
  const [localError, setLocalError] = useState<string | null>(null);
  const records = useMemo(() => generations.data ?? [], [generations.data]);
  const latest = records[0];
  const latestSuccess = records.find(
    (record) => record.status === "completed" && record.images.length > 0,
  );
  const outputImages = useMemo(
    () =>
      records.flatMap((record) =>
        record.status === "completed" ? record.images : [],
      ),
    [records],
  );
  const selectedImage = outputImages.find(
    (image) => image.id === selectedOutputImageId,
  );
  const displayedImage = selectedImage ?? latestSuccess?.images[0] ?? null;
  const active = latest ? activeStatuses.includes(latest.status) : false;
  const status: DisplayStatus = execute.isPending
    ? "submitting"
    : (latest?.status ?? "idle");
  const runnable = Boolean(config.prompt.trim() && config.modelKey) && !active;
  const errorMessage =
    localError ?? latest?.errorMessage ?? (generations.isError ? t("execution.loadError") : null);

  useEffect(() => {
    const defaultOutput = latestSuccess?.images[0];
    if (!selectedOutputImageId && defaultOutput) {
      selectImageNodeOutput(nodeId, defaultOutput.id);
    }
  }, [
    latestSuccess,
    nodeId,
    selectImageNodeOutput,
    selectedOutputImageId,
  ]);

  const run = async () => {
    if (!runnable || execute.isPending) return;
    setLocalError(null);
    try {
      const expectedGraphVersion = await prepareImageNodeExecution();
      await execute.mutateAsync({ graphId, nodeId, expectedGraphVersion });
    } catch (error) {
      const code =
        error instanceof NodeGenerationApiError ? error.code : error instanceof Error ? error.message : "UNKNOWN_ERROR";
      const inputLimit =
        error instanceof NodeGenerationApiError &&
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
      <div className="nodrag nopan mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 text-[11px] text-white/48",
            status === "failed" && "text-red-200/85",
            status === "completed" && "text-primary/85",
          )}
        >
          {statusIcon(status)}
          <span className="truncate">{t(`execution.status.${status}`)}</span>
        </span>
        {displayedImage ? (
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10">
            <Image
              src={displayedImage.url}
              alt={t("execution.latestResult")}
              fill
              sizes="32px"
              unoptimized
              className="object-cover"
            />
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="nodrag nopan grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" aria-label={t("execution.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold text-white/60",
            status === "failed" && "text-red-200",
            status === "completed" && "text-primary",
          )}
          aria-live="polite"
        >
          {statusIcon(status)}
          {t(`execution.status.${status}`)}
          {status === "pending" || status === "processing" ? ` · ${latest?.progress ?? 0}%` : null}
        </span>
        <AppButton
          type="button"
          variant="primary"
          size="sm"
          disabled={!runnable || execute.isPending}
          aria-busy={execute.isPending || active}
          onClick={() => void run()}
        >
          {latest ? <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
          {latest ? t("actions.rerunNode") : t("actions.runNode")}
        </AppButton>
      </div>

      {!config.prompt.trim() || !config.modelKey ? (
        <p className="text-[11px] leading-5 text-white/45">{t("execution.configureFirst")}</p>
      ) : null}

      {status === "pending" || status === "processing" ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/8"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={latest?.progress ?? 0}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${latest?.progress ?? 0}%` }}
          />
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

      {displayedImage ? (
        <div className="grid gap-2">
          <div className="relative aspect-square max-h-64 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <Image
              src={displayedImage.url}
              alt={t("execution.latestResult")}
              fill
              sizes="(max-width: 768px) 80vw, 360px"
              unoptimized
              className="object-contain"
            />
          </div>
          {outputImages.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t("execution.outputs")}>
              {outputImages.map((image, index) => {
                const selected = image.id === (selectedOutputImageId ?? displayedImage.id);
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "border-primary ring-1 ring-primary/25" : "border-white/10",
                    )}
                    aria-label={t("execution.selectOutput", { index: index + 1 })}
                    aria-pressed={selected}
                    onClick={() => selectImageNodeOutput(nodeId, image.id)}
                  >
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      sizes="56px"
                      unoptimized
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-white/60">
              {t("execution.history", { count: records.length })}
            </summary>
            <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto pr-1">
              {records.map((record) => (
                <div key={record.requestId} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 px-2.5 py-2 text-[10px] text-white/45">
                  <span className="truncate">{record.modelKey ?? t("node.modelUnselected")}</span>
                  <span>{t(`execution.status.${record.status}`)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : records.length === 0 && !execute.isPending ? (
        <p className="text-[11px] leading-5 text-white/40">{t("execution.empty")}</p>
      ) : null}
    </section>
  );
}
