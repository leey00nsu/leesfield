"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AnnotationShape } from "@node-banana-runtime/runtime-entry";
import { mediaAssetKeys, useMediaAsset, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { getMediaAssetContentUrl } from "@/shared/media-assets/media-asset-content";
import { AppButton } from "@/shared/ui/app-button";

import {
  useCancelNodeExecution,
  useNodeExecutions,
  useStartNodeExecution,
} from "../../hook/use-node-executions";
import { runBrowserImageOperation } from "../../lib/browser-image-operation-runner";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { getPrimaryNodeRunReadinessReason } from "../../model/node-run-readiness";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { NodeBananaAnnotationEditor } from "./node-banana-annotation-editor";
import { NodeBananaOperationPreview } from "./node-banana-operation-preview";
import { useOperationOutputAssets } from "./use-operation-output-assets";

type ImageOperationKind =
  | "edit.image.annotation"
  | "edit.image.resize"
  | "edit.image.removeBackground"
  | "edit.image.splitGrid"
  | "edit.image.gif";

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Field({
  label,
  value,
  min,
  max,
  step,
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
        step={step ?? 1}
        disabled={disabled}
        className="h-8 rounded-lg border border-white/10 bg-black/25 px-2 text-xs normal-case tracking-normal text-white outline-none focus:border-primary/70"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function GridDimensionField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: "Rows" | "Columns";
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const clamped = (next: number) => Math.min(20, Math.max(1, next));
  return (
    <div className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
      <span>{label}</span>
      <div className="flex h-8 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= 1}
          className="w-8 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-35"
          onClick={() => onChange(clamped(value - 1))}
        >
          −
        </button>
        <input
          type="number"
          aria-label={label}
          min={1}
          max={20}
          value={value}
          disabled={disabled}
          className="min-w-0 flex-1 border-x border-neutral-700 bg-transparent text-center text-xs normal-case tracking-normal text-white outline-none"
          onChange={(event) => onChange(clamped(Number(event.target.value)))}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= 20}
          className="w-8 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-35"
          onClick={() => onChange(clamped(value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function ImageOperationNodeControls({
  id,
  data,
  kind,
  editorOpen,
  onEditorOpenChange,
}: {
  id: string;
  data: NodeBananaNodeData;
  kind: ImageOperationKind;
  editorOpen?: boolean;
  onEditorOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const queryClient = useQueryClient();
  const executions = useNodeExecutions(authoring.graphId, id);
  const start = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const controller = useRef<AbortController | null>(null);
  const runRef = useRef<() => Promise<void>>(async () => undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const [annotationPreview, setAnnotationPreview] = useState<{
    url: string;
    baselineOutputAssetId: string | null;
  } | null>(null);
  const [localAnnotationOpen, setLocalAnnotationOpen] = useState(false);
  const annotationOpen = editorOpen ?? localAnnotationOpen;
  const setAnnotationOpen = onEditorOpenChange ?? setLocalAnnotationOpen;
  const config = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, unknown>
    : {};
  const parameters = config.parameters && typeof config.parameters === "object" && !Array.isArray(config.parameters)
    ? config.parameters as Record<string, unknown>
    : {};
  const inputAssetId = authoring.getNodeInputAssetId?.(id, "image") ?? null;
  const inputAsset = useMediaAsset(inputAssetId);
  const selectedOutputAsset = useMediaAsset(data.selectedOutputAssetId);
  const frameAssets = useMediaAssetList(
    kind === "edit.image.gif" ? authoring.getNodeInputAssetIds?.(id, "frames") ?? [] : [],
  );
  const active = executions.data?.find((execution) =>
    execution.status === "pending" || execution.status === "processing" || execution.status === "uploading",
  );
  const latest = active ?? executions.data?.[0];
  const operationOutputs = useOperationOutputAssets(
    executions.data,
    data.selectedOutputAssetId,
  );
  const outputAsset = operationOutputs.assets[0] ?? selectedOutputAsset.data ?? null;
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const unavailable = kind === "edit.image.removeBackground" && !authoring.backgroundRemovalAvailable;
  const runReadiness = authoring.getNodeRunReadiness?.(id) ?? {
    ready: !unavailable,
    reasons: unavailable ? ["PROCESSOR_UNAVAILABLE" as const] : [],
  };
  const blockedReason = getPrimaryNodeRunReadinessReason(runReadiness);
  const runnable = writable && runReadiness.ready && !unavailable && !start.isPending;

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (
      !annotationPreview ||
      !outputAsset?.id ||
      outputAsset.id === annotationPreview.baselineOutputAssetId
    ) return;
    URL.revokeObjectURL(annotationPreview.url);
    setAnnotationPreview(null);
  }, [annotationPreview, outputAsset?.id]);

  useEffect(() => () => {
    if (annotationPreview) URL.revokeObjectURL(annotationPreview.url);
  }, [annotationPreview]);

  const updateParameters = (patch: Record<string, unknown>) => {
    authoring.updateCanonicalNodeConfig?.(id, {
      ...config,
      parameters: { ...parameters, ...patch },
    } as CanonicalJsonValue);
  };

  const controls = (() => {
    if (kind === "edit.image.resize") {
      const mode = typeof parameters.mode === "string" ? parameters.mode : "maxEdge";
      const format = typeof parameters.format === "string" ? parameters.format : "keep";
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex gap-1" role="group" aria-label="Resize mode">
            {(["exact", "maxEdge", "scale"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                disabled={!writable}
                aria-pressed={mode === candidate}
                className={`flex-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                  mode === candidate
                    ? "bg-primary text-black"
                    : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                }`}
                onClick={() => updateParameters({ mode: candidate })}
              >
                {candidate === "exact" ? "Exact" : candidate === "maxEdge" ? "Max Edge" : "Scale %"}
              </button>
            ))}
          </div>
          {mode === "exact" ? <>
            <Field label="Width" value={number(parameters.width, 1024)} min={1} max={8192} disabled={!writable} onChange={(value) => updateParameters({ width: value })} />
            <Field label="Height" value={number(parameters.height, 1024)} min={1} max={8192} disabled={!writable} onChange={(value) => updateParameters({ height: value })} />
            <label className="col-span-2 grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
              Fit
              <select value={typeof parameters.fit === "string" ? parameters.fit : "contain"} disabled={!writable} className="h-8 rounded-lg border border-white/10 bg-[#111412] px-2 text-xs normal-case tracking-normal text-white" onChange={(event) => updateParameters({ fit: event.target.value })}>
                <option value="contain">Contain</option><option value="cover">Cover</option><option value="stretch">Stretch</option>
              </select>
            </label>
            <label className="col-span-2 grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
              Pad color
              <input type="text" value={typeof parameters.padColor === "string" ? parameters.padColor : "#00000000"} disabled={!writable} className="h-8 rounded-lg border border-white/10 bg-black/25 px-2 text-xs normal-case tracking-normal text-white outline-none focus:border-primary/70" onChange={(event) => updateParameters({ padColor: event.target.value })} />
            </label>
          </> : null}
          {mode === "maxEdge" ? <Field label="Max edge" value={number(parameters.maxEdge, 2048)} min={1} max={8192} disabled={!writable} onChange={(value) => updateParameters({ maxEdge: value })} /> : null}
          {mode === "scale" ? <Field label="Scale %" value={number(parameters.scalePct, 100)} min={1} max={800} disabled={!writable} onChange={(value) => updateParameters({ scalePct: value })} /> : null}
          <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
            Format
            <select value={format} disabled={!writable} className="h-8 rounded-lg border border-white/10 bg-[#111412] px-2 text-xs normal-case tracking-normal text-white" onChange={(event) => updateParameters({ format: event.target.value })}>
              <option value="keep">Keep</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option>
            </select>
          </label>
          {format === "jpeg" || format === "webp" ? <Field label="Quality" value={number(parameters.quality, 0.92)} min={0.1} max={1} step={0.05} disabled={!writable} onChange={(value) => updateParameters({ quality: value })} /> : null}
        </div>
      );
    }
    if (kind === "edit.image.splitGrid") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <GridDimensionField label="Rows" value={number(parameters.rows, 2)} disabled={!writable} onChange={(value) => updateParameters({ rows: value })} />
          <GridDimensionField label="Columns" value={number(parameters.cols, 2)} disabled={!writable} onChange={(value) => updateParameters({ cols: value })} />
        </div>
      );
    }
    if (kind === "edit.image.gif") {
      const targetMaxBytes = typeof parameters.targetMaxBytes === "number" ? parameters.targetMaxBytes : null;
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="FPS" value={number(parameters.fps, 8)} min={1} max={60} disabled={!writable} onChange={(value) => updateParameters({ fps: value })} />
          <Field label="Colors" value={number(parameters.colorCount, 128)} min={2} max={256} disabled={!writable} onChange={(value) => updateParameters({ colorCount: value })} />
          <Field label="Loop count" value={number(parameters.loopCount, 0)} min={0} max={65_535} disabled={!writable} onChange={(value) => updateParameters({ loopCount: value })} />
          <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-white/60"><input type="checkbox" checked={parameters.dither === true} disabled={!writable} onChange={(event) => updateParameters({ dither: event.target.checked })} />Dither</label>
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={targetMaxBytes !== null} disabled={!writable} onChange={(event) => updateParameters({ targetMaxBytes: event.target.checked ? 128 * 1024 : null })} />Target ≤</label>
          {targetMaxBytes !== null ? <div className="col-span-2"><Field label="Target (KB)" value={Math.round(targetMaxBytes / 1024)} min={1} max={102_400} disabled={!writable} onChange={(value) => updateParameters({ targetMaxBytes: value * 1024 })} /></div> : null}
        </div>
      );
    }
    if (kind === "edit.image.annotation") {
      const shapes = Array.isArray(parameters.shapes) ? parameters.shapes as AnnotationShape[] : [];
      const displayUrl = annotationPreview?.url ?? outputAsset?.url ?? inputAsset.data?.url ?? null;
      return (
        <>
          <button
            type="button"
            disabled={!writable || !inputAsset.data?.url}
            onClick={() => setAnnotationOpen(true)}
            className="group/annotation relative flex min-h-36 w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-900/40 transition-colors hover:bg-neutral-800/60 disabled:cursor-not-allowed"
          >
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={displayUrl} alt={annotationPreview || outputAsset ? "Annotated result" : "Annotation source"} className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-neutral-500">Connect an image</span>
            )}
            {inputAsset.data?.url ? (
              <span className="relative rounded bg-black/60 px-3 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover/annotation:opacity-100 group-focus-visible/annotation:opacity-100">
                {shapes.length > 0 ? `Edit (${shapes.length})` : "Add annotations"}
              </span>
            ) : null}
          </button>
          <NodeBananaAnnotationEditor
            open={annotationOpen}
            sourceUrl={inputAssetId ? getMediaAssetContentUrl(inputAssetId) : null}
            initialShapes={shapes}
            onClose={() => setAnnotationOpen(false)}
            onSave={(nextShapes, preview) => {
              updateParameters({ shapes: nextShapes });
              if (annotationPreview) URL.revokeObjectURL(annotationPreview.url);
              setAnnotationPreview({
                url: URL.createObjectURL(preview.blob),
                baselineOutputAssetId: outputAsset?.id ?? null,
              });
              setAnnotationOpen(false);
              void runRef.current();
            }}
          />
        </>
      );
    }
    return null;
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
        const assets = await runBrowserImageOperation({
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
  runRef.current = run;

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
      {kind === "edit.image.gif" ? (
        <div className="flex h-16 gap-1 overflow-x-auto rounded border border-neutral-700 bg-neutral-900/40 p-1" data-node-banana-component="FrameFilmstrip">
          {frameAssets.length ? frameAssets.map((query, index) => query.data?.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={query.data.id} src={query.data.url} alt={`Frame ${index + 1}`} className="aspect-square h-full shrink-0 rounded object-cover" />
          ) : null) : (
            <span className="m-auto text-[10px] text-neutral-500">Connect image frames</span>
          )}
        </div>
      ) : null}
      {kind !== "edit.image.annotation" ? (
        <NodeBananaOperationPreview
          asset={outputAsset ?? inputAsset.data}
          expectedType="image"
          output={Boolean(outputAsset)}
          emptyLabel={kind === "edit.image.gif" ? "Connect image frames" : "Connect an image"}
          grid={kind === "edit.image.splitGrid" ? {
            rows: number(parameters.rows, 2),
            columns: number(parameters.cols, 2),
          } : undefined}
          onClearOutput={data.selectedOutputAssetId
            ? () => authoring.selectNodeOutputAsset?.(id, null)
            : undefined}
        />
      ) : null}
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
        ) : kind === "edit.image.annotation" ? <span /> : (
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
