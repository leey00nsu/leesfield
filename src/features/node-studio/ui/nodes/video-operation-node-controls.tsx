"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { mediaAssetKeys, useMediaAsset, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
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
}: {
  id: string;
  data: NodeBananaNodeData;
  kind: VideoOperationKind;
}) {
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const queryClient = useQueryClient();
  const executions = useNodeExecutions(authoring.graphId, id);
  const start = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const controller = useRef<AbortController | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
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
  const active = executions.data?.find((execution) =>
    execution.status === "pending" || execution.status === "processing" || execution.status === "uploading",
  );
  const latest = active ?? executions.data?.[0];
  const operationOutputs = useOperationOutputAssets(executions.data, data.selectedOutputAssetId);
  const outputAsset = operationOutputs.assets[0] ?? selectedOutputAsset.data ?? null;
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const settingsInherited = kind === "edit.video.easeCurve" && Boolean(authoring.isNodePortConnected?.(id, "settings"));
  const controlsWritable = writable && !settingsInherited;
  const runReadiness = authoring.getNodeRunReadiness?.(id) ?? { ready: true, reasons: [] };
  const blockedReason = getPrimaryNodeRunReadinessReason(runReadiness);
  const runnable = writable && runReadiness.ready && !start.isPending;

  useEffect(() => () => controller.current?.abort(), []);

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
            label="Sequence repeat"
            value={number(parameters.repeat, 1)}
            min={1}
            max={3}
            disabled={!writable}
            onChange={(repeat) => updateParameters({ repeat })}
          />
          <label className="flex items-center gap-2 text-[11px] text-white/60">
            <input
              type="checkbox"
              checked={stripAudio}
              disabled={!writable}
              onChange={(event) => updateParameters({ stripAudio: event.target.checked })}
            />
            Remove all source and soundtrack audio
          </label>
        </div>
      );
    }
    if (kind === "edit.video.trim") {
      const durationSeconds = Math.max(0.001, (inputAsset.data?.durationMs ?? 600_000) / 1_000);
      const startSeconds = number(parameters.startMs, 0) / 1_000;
      const endSeconds = Math.min(durationSeconds, number(parameters.endMs, 5_000) / 1_000);
      return (
        <div className="grid gap-2">
          <div className="relative h-5" data-node-banana-component="TrimRange">
            <div className="pointer-events-none absolute inset-x-0 top-2 h-1.5 rounded-full bg-neutral-700" />
            <input
              type="range"
              aria-label="Trim start"
              min={0}
              max={durationSeconds}
              step={0.1}
              value={Math.min(startSeconds, endSeconds)}
              disabled={!writable}
              className="nodrag absolute inset-0 w-full accent-primary"
              onChange={(event) => updateParameters({ startMs: Math.round(Number(event.target.value) * 1_000) })}
            />
            <input
              type="range"
              aria-label="Trim end"
              min={0}
              max={durationSeconds}
              step={0.1}
              value={Math.max(startSeconds, endSeconds)}
              disabled={!writable}
              className="nodrag absolute inset-0 w-full accent-primary"
              onChange={(event) => updateParameters({ endMs: Math.round(Number(event.target.value) * 1_000) })}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-neutral-400">
            <span>Start {startSeconds.toFixed(1)}s</span>
            <span>Duration {Math.max(0, endSeconds - startSeconds).toFixed(1)}s</span>
            <span>End {endSeconds.toFixed(1)}s</span>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-white/60">
            <input
              type="checkbox"
              checked={stripAudio}
              disabled={!writable}
              onChange={(event) => updateParameters({ stripAudio: event.target.checked })}
            />
            Remove embedded audio
          </label>
        </div>
      );
    }
    if (kind === "edit.video.frameGrab") {
      const position = parameters.position === "last" ? "last" : "first";
      return (
        <div className="flex gap-1" role="group" aria-label="Frame position">
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
              {candidate === "first" ? "First" : "Last"}
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
          label="Output (s)"
          value={number(parameters.outputDurationMs, 1_500) / 1_000}
          min={0.1}
          max={600}
          step={0.1}
          disabled={!controlsWritable}
          onChange={(value) => updateParameters({ outputDurationMs: Math.round(value * 1_000) })}
        />
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
          Curve
          <select
            value={preset}
          disabled={!controlsWritable}
            className="h-8 rounded-lg border border-white/10 bg-[#111412] px-2 text-xs normal-case tracking-normal text-white"
            onChange={(event) => updateParameters({ easingPreset: event.target.value === "custom" ? null : event.target.value })}
          >
            {easingPresets.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value="custom">Custom bezier</option>
          </select>
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
    setLocalError(null);
    try {
      const prepare = authoring.prepareNodeExecution ?? authoring.prepareImageNodeExecution;
      const expectedGraphVersion = await prepare();
      const execution = await start.mutateAsync({ graphId: authoring.graphId, nodeId: id, expectedGraphVersion });
      if (execution.plan) {
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

  return (
    <div className="nodrag nowheel mt-4 grid gap-2" data-node-banana-kind={kind} onPointerDown={(event) => event.stopPropagation()}>
      {kind === "edit.video.stitch" ? (
        <div className="flex h-20 gap-1 overflow-x-auto rounded border border-neutral-700 bg-neutral-900/40 p-1" data-node-banana-component="ClipFilmstrip">
          {clipAssets.length ? clipAssets.map((query, index) => query.data?.type === "video" ? (
            <video key={query.data.id} src={query.data.url} muted playsInline preload="metadata" aria-label={`Video ${index + 1}`} className="aspect-video h-full shrink-0 rounded object-cover" />
          ) : null) : (
            <span className="m-auto text-[10px] text-neutral-500">Connect videos</span>
          )}
        </div>
      ) : null}
      <NodeBananaOperationPreview
        asset={outputAsset ?? inputAsset.data}
        expectedType={kind === "edit.video.frameGrab" ? "image" : "video"}
        output={Boolean(outputAsset)}
        emptyLabel={kind === "edit.video.stitch" ? "Connect videos to stitch" : "Connect a video"}
        onClearOutput={data.selectedOutputAssetId
          ? () => authoring.selectNodeOutputAsset?.(id, null)
          : undefined}
      />
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
        {active || controller.current ? (
          <AppButton type="button" size="sm" variant="surface-muted" disabled={cancel.isPending} onClick={() => void stop()}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </AppButton>
        ) : (
          <AppButton type="button" size="sm" data-node-run disabled={!runnable} onClick={() => void run()}>
            {start.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </AppButton>
        )}
      </div>
      {localError || executions.isError || start.isError || cancel.isError ? (
        <p className="text-[11px] text-red-200" role="alert">{localError ?? t("generationNode.executionError")}</p>
      ) : null}
    </div>
  );
}
