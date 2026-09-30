"use client";
import { AppChoiceSelect } from "@/shared/ui/app-choice-select";
import { Switch } from "@/shared/ui/brand/switch/switch";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, LoaderCircle, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { mediaAssetKeys, useMediaAsset, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { AppButton } from "@/shared/ui/app-button";

import {
  useCancelNodeExecution,
  useNodeExecutions,
  useStartNodeExecution,
} from "../../hook/use-node-executions";
import { runBrowserVideoOperation } from "../../lib/browser-video-operation-runner";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { getPrimaryNodeRunReadinessReason } from "../../model/node-run-readiness";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { NodeBananaOperationPreview } from "./node-banana-operation-preview";
import { useOperationOutputAssets } from "./use-operation-output-assets";
import { NodeBananaExecutionHeader } from "./node-banana-execution-header";
import { VideoTrimEditor } from "./video-trim-editor";

export type VideoOperationKind =
  | "edit.video.stitch"
  | "edit.video.trim"
  | "edit.video.frameGrab"
  | "edit.video.easeCurve";

const easingPresets = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
] as const;

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="h-8 rounded-lg border border-white/10 bg-black/25 px-2 text-xs normal-case tracking-normal text-white outline-none focus:border-primary/70"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function VideoOperationNodeControls({
  id,
  data,
  kind,
  clipEdgeIds = [],
  selected = false,
  title,
}: {
  id: string;
  data: NodeBananaNodeData;
  kind: VideoOperationKind;
  clipEdgeIds?: string[];
  selected?: boolean;
  title?: string;
}) {
  const tc = useCanvasTranslation();
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const queryClient = useQueryClient();
  const [executionPrepared, setExecutionPrepared] = useState(false);
  const executions = useNodeExecutions(authoring.graphId, id, executionPrepared || (authoring.isNodePersisted?.(id) ?? true));
  const start = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const controller = useRef<AbortController | null>(null);
  const pendingServerExecutionId = useRef<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const customHeader = kind === "edit.video.stitch" || kind === "edit.video.trim";
  const config = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, unknown>
    : {};
  const parameters = config.parameters && typeof config.parameters === "object" && !Array.isArray(config.parameters)
    ? config.parameters as Record<string, unknown>
    : {};
  const inputPortId = kind === "edit.video.stitch" ? "clips" : "video";
  const inputAsset = useMediaAsset(authoring.getNodeInputAssetId?.(id, inputPortId) ?? null);
  const selectedOutputAsset = useMediaAsset(data.selectedOutputAssetId);
  const clipAssets = useMediaAssetList(
    kind === "edit.video.stitch" ? authoring.getNodeInputAssetIds?.(id, "clips") ?? [] : [],
  );
  const configuredClipOrder = Array.isArray(parameters.clipOrder)
    ? parameters.clipOrder.filter((id): id is string => typeof id === "string")
    : [];
  const orderedClipIndices = clipEdgeIds.map((edgeId, index) => ({ edgeId, index }))
    .sort((left, right) => {
      const leftRank = configuredClipOrder.indexOf(left.edgeId);
      const rightRank = configuredClipOrder.indexOf(right.edgeId);
      return (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank)
        - (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank)
        || left.index - right.index;
    });
  const active = executions.data?.find((execution) =>
    execution.status === "pending" || execution.status === "processing" || execution.status === "uploading",
  );
  const latest = active ?? executions.data?.[0];
  const operationOutputs = useOperationOutputAssets(executions.data, data.selectedOutputAssetId);
  const outputAsset = operationOutputs.assets[0] ?? selectedOutputAsset.data ?? null;
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig) && !isUnavailableEditNodeKind(kind);
  const settingsInherited = kind === "edit.video.easeCurve" && Boolean(authoring.isNodePortConnected?.(id, "settings"));
  const controlsWritable = writable && !settingsInherited;
  const runReadiness = authoring.getNodeRunReadiness?.(id) ?? { ready: true, reasons: [] };
  const blockedReason = getPrimaryNodeRunReadinessReason(runReadiness);
  const trimRangeValid = kind !== "edit.video.trim" || !inputAsset.data?.durationMs ||
    (number(parameters.startMs, 0) >= 0 &&
      number(parameters.endMs, 5_000) > number(parameters.startMs, 0) &&
      number(parameters.endMs, 5_000) <= inputAsset.data.durationMs);
  const runnable = writable && runReadiness.ready && trimRangeValid && !start.isPending && !active && !submitting;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const pendingId = pendingServerExecutionId.current;
    if (!pendingId) return;
    const completed = executions.data?.find((execution) => execution.executionId === pendingId && execution.status === "completed");
    if (completed?.outputAssetIds[0]) {
      pendingServerExecutionId.current = null;
      authoring.selectNodeOutputAsset?.(id, completed.outputAssetIds[0]);
      void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
    } else if (executions.data?.some((execution) => execution.executionId === pendingId &&
      (execution.status === "failed" || execution.status === "cancelled"))) {
      pendingServerExecutionId.current = null;
    }
  }, [authoring, executions.data, id, queryClient]);

  const updateParameters = (patch: Record<string, unknown>) => {
    authoring.updateCanonicalNodeConfig?.(id, {
      ...config,
      parameters: { ...parameters, ...patch },
    } as CanonicalJsonValue);
  };

  const stripAudio = parameters.stripAudio === true;
  const controls = (() => {
    if (kind === "edit.video.stitch") {
      return (
        <div className="grid gap-2">
          <NumberField
            label={tc("Sequence repeat")}
            value={number(parameters.repeat, 1)}
            min={1}
            max={3}
            disabled={!writable}
            onChange={(repeat) => updateParameters({ repeat })}
          />
          <label className="flex items-center gap-2 text-[11px] text-white/60">
            <Switch
              checked={stripAudio}
              disabled={!writable}
              onCheckedChange={stripAudio => updateParameters({stripAudio})}
            />{tc("Remove all source and soundtrack audio")}</label>
        </div>
      );
    }
    if (kind === "edit.video.trim") {
      return <VideoTrimEditor key={inputAsset.data?.id ?? "empty"} source={inputAsset.data} output={outputAsset}
        startMs={number(parameters.startMs, 0)} endMs={number(parameters.endMs, 5_000)}
        stripAudio={stripAudio} writable={writable} onChange={updateParameters}
        onClearOutput={data.selectedOutputAssetId ? () => authoring.selectNodeOutputAsset?.(id, null) : undefined} />;
    }
    if (kind === "edit.video.frameGrab") {
      const position = parameters.position === "last" ? "last" : "first";
      return (
        <div className="flex gap-1" role="group" aria-label={tc("Frame position")}>
          {(["first", "last"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              disabled={!writable}
              aria-pressed={position === candidate}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                position === candidate
                  ? "bg-primary text-black"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
              onClick={() => updateParameters({ position: candidate })}
            >
              {candidate === "first" ? tc("First") : tc("Last")}
            </button>
          ))}
        </div>
      );
    }
    const bezier = Array.isArray(parameters.bezier) && parameters.bezier.length === 4
      ? parameters.bezier.map((value) => number(value, 0))
      : [0.42, 0, 0.58, 1];
    const preset = typeof parameters.easingPreset === "string" ? parameters.easingPreset : "custom";
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={tc("Output (s)")}
          value={number(parameters.outputDurationMs, 1_500) / 1_000}
          min={0.1}
          max={600}
          step={0.1}
          disabled={!controlsWritable}
          onChange={(value) => updateParameters({ outputDurationMs: Math.round(value * 1_000) })}
        />
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">{tc("Curve")}<AppChoiceSelect label={tc("Curve")} value={preset} disabled={!controlsWritable} onValueChange={value => updateParameters({easingPreset:value === "custom" ? null : value})} options={[...easingPresets.map(value=>({value,label:value})),{value:"custom",label:tc("Custom bezier")}]} />
        </label>
        {preset === "custom" ? bezier.map((value, index) => (
          <NumberField
            key={index}
            label={`Bezier ${index + 1}`}
            value={value}
            min={0}
            max={1}
            step={0.01}
            disabled={!controlsWritable}
            onChange={(next) => {
              const values = [...bezier];
              values[index] = next;
              updateParameters({ bezier: values });
            }}
          />
        )) : null}
      </div>
    );
  })();

  const run = async () => {
    if (!runnable) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const prepare = authoring.prepareNodeExecution ?? authoring.prepareImageNodeExecution;
      const expectedGraphVersion = await prepare();
      setExecutionPrepared(true);
      const execution = await start.mutateAsync({ graphId: authoring.graphId, nodeId: id, expectedGraphVersion });
      if (!execution.plan && (kind === "edit.video.stitch" || kind === "edit.video.trim")) {
        pendingServerExecutionId.current = execution.executionId;
      }
      if (execution.plan && kind !== "edit.video.stitch" && kind !== "edit.video.trim") {
        controller.current = new AbortController();
        const assets = await runBrowserVideoOperation({
          graphId: authoring.graphId,
          nodeId: id,
          execution,
          signal: controller.current.signal,
        });
        if (assets[0]) authoring.selectNodeOutputAsset?.(id, assets[0].id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all }),
        executions.refetch(),
      ]);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setLocalError(error instanceof Error ? error.message : "PROCESSOR_FAILED");
      }
    } finally {
      controller.current = null;
      setSubmitting(false);
    }
  };

  const stop = async () => {
    controller.current?.abort();
    if (active) {
      await cancel.mutateAsync({
        graphId: authoring.graphId,
        nodeId: id,
        executionId: active.executionId,
      }).catch(() => undefined);
    }
  };

  return (<>
    {customHeader ? <NodeBananaExecutionHeader
      id={id} title={title ?? tc(kind === "edit.video.stitch" ? "Video Stitch" : "Video Trim")}
      config={data.config} selected={selected} ready={writable && runReadiness.ready && trimRangeValid}
      executing={Boolean(active) || submitting || start.isPending}
      disabledReason={blockedReason ? t(`execution.blocked.${blockedReason}`) : !trimRangeValid ? tc("Adjust the trim range to fit the video.") : null}
      onRun={() => void run()} onCancel={active ? () => void stop() : undefined} cancelling={cancel.isPending}
    /> : null}
    <div className="nodrag nowheel mt-4 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto" data-node-banana-kind={kind} onPointerDown={(event) => event.stopPropagation()}>
      {kind === "edit.video.stitch" ? (
        <div className="flex min-h-20 gap-1 overflow-x-auto rounded border border-neutral-700 bg-neutral-900/40 p-1" data-leesfield-component="VideoClipOrder">
          {clipAssets.length ? orderedClipIndices.map(({ edgeId, index: sourceIndex }, index) => {
            const asset = clipAssets[sourceIndex]?.data;
            if (asset?.type !== "video") return null;
            const move = (direction: -1 | 1) => {
              const reordered = [...orderedClipIndices.map((item) => item.edgeId)];
              const next = index + direction;
              if (next < 0 || next >= reordered.length) return;
              [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
              updateParameters({ clipOrder: reordered });
            };
            return <div key={edgeId} className="relative aspect-video h-20 shrink-0 overflow-hidden rounded" >
              <video src={asset.url} muted playsInline preload="metadata" aria-label={`Video ${index + 1}`} className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{index + 1}</span>
              <div className="absolute bottom-0 right-0 flex gap-0.5 bg-black/70">
                <button type="button" aria-label={`Move video ${index + 1} earlier`} disabled={!writable || index === 0} onClick={() => move(-1)}><ArrowLeft size={14} /></button>
                <button type="button" aria-label={`Move video ${index + 1} later`} disabled={!writable || index === orderedClipIndices.length - 1} onClick={() => move(1)}><ArrowRight size={14} /></button>
              </div>
            </div>;
          }) : (
            <span className="m-auto text-[10px] text-neutral-500">{tc("Connect videos")}</span>
          )}
        </div>
      ) : null}
      {kind !== "edit.video.trim" ? <NodeBananaOperationPreview
        asset={outputAsset ?? inputAsset.data}
        expectedType={kind === "edit.video.frameGrab" ? "image" : "video"}
        output={Boolean(outputAsset)}
        emptyLabel={kind === "edit.video.stitch" ? tc("Connect videos to stitch") : tc("Connect a video")}
        onClearOutput={data.selectedOutputAssetId
          ? () => authoring.selectNodeOutputAsset?.(id, null)
          : undefined}
      /> : null}
      {controls}
      <div className="flex items-center justify-between gap-2">
        {latest || blockedReason ? (
          <span className="min-w-0 text-[11px] leading-4 text-white/50" role="status" aria-live="polite">
            {latest ? t(`execution.status.${latest.status}`) : t(`execution.blocked.${blockedReason}`)}
            {latest && !["completed", "failed", "cancelled"].includes(latest.status)
              ? ` · ${Math.round(latest.progress)}%`
              : ""}
          </span>
        ) : <span />}
        {!customHeader && (active || controller.current) ? (
          <AppButton type="button" size="sm" variant="surface-muted" aria-label={t("actions.cancel")} disabled={cancel.isPending} onClick={() => void stop()}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </AppButton>
        ) : !customHeader ? (
          <AppButton type="button" size="sm" data-node-run aria-label={t("actions.runNode")} disabled={!runnable} onClick={() => void run()}>
            {start.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </AppButton>
        ) : null}
      </div>
      {localError || latest?.status === "failed" || executions.isError || start.isError || cancel.isError ? (
        <p className="text-[11px] text-red-200" role="alert">{localError ?? latest?.errorCode ?? t("generationNode.executionError")}</p>
      ) : null}
    </div></>
  );
}
