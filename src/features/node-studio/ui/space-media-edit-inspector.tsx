"use client";

/* Resize controls adapted from Node Banana's ImageResizeNode.
 * MIT License
 * Copyright (c) 2026 William Falloon
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMediaAsset, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalEdge, CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { AppButton } from "@/shared/ui/app-button";
import { AppChoiceSelect } from "@/shared/ui/app-choice-select";
import { AppInput } from "@/shared/ui/app-input";
import { AppTabs } from "@/shared/ui/app-tabs";
import { Switch } from "@/shared/ui/brand/switch/switch";
import { updateSpaceNodeAuthoringConfig } from "../model/space-editor-authoring";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "./space-editor-provider";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Match server ordering, then expand every edge's collection without deduplication. */
function orderedClipEdges(edges: readonly CanonicalEdge[], parameters: Record<string, unknown>) {
  const ranks = new Map<string, number>();
  if (Array.isArray(parameters.clipOrder)) for (const id of parameters.clipOrder) {
    if (typeof id === "string" && !ranks.has(id)) ranks.set(id, ranks.size);
  }
  return edges.filter(edge => !edge.hasPause).sort((a, b) =>
    (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Inspector writes do not depend on the node body's scoped authoring provider. */
function useMediaEditParameters(nodeId: string, kind: string) {
  const scope = useSpaceEditor(), epoch = useSpaceViewSelector(state => state.epoch);
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable && !state.disposed);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const disabled = !writable || !node || node.kind !== kind || !validateNodeConfig(node.kind, node.configVersion, node.config).supported;
  const update = (patch: Record<string, CanonicalJsonValue>) => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    if (!mounted.current || !state.writable || state.disposed || scope.view.getState().epoch !== epoch
      || !current || current.kind !== kind || !validateNodeConfig(current.kind, current.configVersion, current.config).supported) return;
    const config = record(current.config);
    const result = scope.session.transact(document => updateSpaceNodeAuthoringConfig(document, nodeId, current.config,
      { ...config, parameters: { ...record(config.parameters), ...patch } } as CanonicalJsonValue, scope.view.getState().catalog),
    { origin: "user", label: "media.parameters" });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  return { scope, parameters: record(record(node?.config).parameters), disabled, update };
}

function NumericField({ label, value, min = 1, max = 8192, step = 1, unit, disabled, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string; disabled: boolean; onChange: (value: number) => void;
}) {
  return <label className="grid min-w-0 gap-1 text-xs text-neutral-400"><span>{label}</span>
    <span className="flex min-w-0 items-center gap-1">
      <AppInput type="number" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled}
        className="h-9 min-w-0 text-sm text-neutral-200" onChange={event => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next) && next >= min && next <= max && (step !== 1 || Number.isInteger(next))) onChange(next);
        }} />
      {unit && <span className="shrink-0 text-xs">{unit}</span>}
    </span>
  </label>;
}

function ResizeSettings({ nodeId }: { nodeId: string }) {
  const { parameters, disabled, update } = useMediaEditParameters(nodeId, "edit.image.resize"), tc = useCanvasTranslation();
  const mode = typeof parameters.mode === "string" ? parameters.mode : "exact";
  const format = typeof parameters.format === "string" ? parameters.format : "png";
  return <div className="space-y-4" data-space-resize-settings="">
    <AppTabs selectionOnly ariaLabel={tc("Resize mode")} value={mode}
      listClassName="h-auto min-h-10 w-full overflow-x-auto overflow-y-hidden" triggerClassName="h-auto min-h-8 text-xs"
      items={(["exact", "maxEdge", "scale"] as const).map(value => ({ value, disabled, label: tc(value === "exact" ? "Exact" : value === "maxEdge" ? "Max Edge" : "Scale %") }))}
      onValueChange={next => { if (!disabled && ["exact", "maxEdge", "scale"].includes(next)) update({ mode: next }); }} />
    <div className="grid grid-cols-2 gap-3">
      {mode === "exact" && <>
        <NumericField label={tc("Width")} value={number(parameters.width, 128)} disabled={disabled} unit="px" onChange={width => update({ width })} />
        <NumericField label={tc("Height")} value={number(parameters.height, 128)} disabled={disabled} unit="px" onChange={height => update({ height })} />
        <div className="space-y-1"><span className="block text-xs text-neutral-400">{tc("Fit")}</span>
          <AppChoiceSelect label={tc("Fit")} value={typeof parameters.fit === "string" ? parameters.fit : "contain"} disabled={disabled}
            options={[{ value: "contain", label: tc("Contain") }, { value: "cover", label: tc("Cover") }, { value: "stretch", label: tc("Stretch") }]}
            onValueChange={fit => update({ fit })} />
        </div>
        <label className="grid gap-1 text-xs text-neutral-400"><span>{tc("Pad color")}</span>
          <AppInput aria-label={tc("Pad color")} value={typeof parameters.padColor === "string" ? parameters.padColor : "#00000000"}
            maxLength={64} disabled={disabled} className="h-9 text-sm text-neutral-200" onChange={event => {
              if (event.currentTarget.value.length) update({ padColor: event.currentTarget.value });
            }} />
        </label>
      </>}
      {mode === "maxEdge" && <NumericField label={tc("Max edge")} value={number(parameters.maxEdge, 128)} disabled={disabled} unit="px" onChange={maxEdge => update({ maxEdge })} />}
      {mode === "scale" && <NumericField label={tc("Scale %")} value={number(parameters.scalePct, 100)} max={800} step={0.01} disabled={disabled} unit="%" onChange={scalePct => update({ scalePct })} />}
      <div className="space-y-1"><span className="block text-xs text-neutral-400">{tc("Format")}</span>
        <AppChoiceSelect label={tc("Format")} value={format} disabled={disabled}
          options={[{ value: "keep", label: tc("Keep") }, { value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }]}
          onValueChange={next => update({ format: next })} />
      </div>
      {(format === "jpeg" || format === "webp") && <NumericField label={tc("Quality")} value={number(parameters.quality, 0.9)} min={0} max={1} step={0.05}
        disabled={disabled} onChange={quality => update({ quality })} />}
    </div>
  </div>;
}

function StitchSettings({ nodeId }: { nodeId: string }) {
  const { scope, parameters, disabled, update } = useMediaEditParameters(nodeId, "edit.video.stitch");
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio"), ko = useLocale() === "ko";
  const { edges, clips, soundtrackId } = useSpaceResolvedInput(nodeId, inputs => {
    const edges = orderedClipEdges(inputs.incomingEdges(nodeId, "clips"), parameters);
    return { edges, clips: edges.flatMap((edge, edgeIndex) => inputs.edgeAssetIds(edge).map((assetId, assetIndex) => ({ edgeId: edge.id, edgeIndex, assetId, assetIndex }))),
      soundtrackId: inputs.inputAssetId(nodeId, "soundtrack") };
  });
  const clipIds = [...new Set(clips.map(clip => clip.assetId))], queries = useMediaAssetList(clipIds);
  const assets = new Map(clipIds.map((id, index) => [id, queries[index]])), soundtrack = useMediaAsset(soundtrackId);
  const moveClip = (edgeId: string, direction: -1 | 1) => {
    const current = scope.session.getSnapshot().nodeById.get(nodeId);
    if (!current || current.kind !== "edit.video.stitch") return;
    const order = orderedClipEdges(scope.inputs.incomingEdges(nodeId, "clips"), record(record(current.config).parameters)).map(edge => edge.id);
    const index = order.indexOf(edgeId), next = index + direction;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    update({ clipOrder: order });
  };
  return <div className="space-y-4" data-space-stitch-settings="">
    <ol className="space-y-2" aria-label={tc("Video Stitch")}>
      {clips.length ? clips.map((clip, index) => {
        const query = assets.get(clip.assetId), asset = query?.data;
        return <li key={JSON.stringify([clip.edgeId, clip.assetIndex])} className="flex min-w-0 items-center gap-2 rounded-md bg-neutral-900/60 p-2"
          data-clip-edge={clip.edgeId} data-clip-asset={clip.assetId} data-clip-index={clip.assetIndex}>
          <span className="text-xs tabular-nums text-neutral-500">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-xs">{asset ? getMediaAssetName(asset) : tc("Video")}</span>
          {query?.isError && <AppButton type="button" variant="ghost" size="sm" onClick={() => { void query.refetch(); }}>{t("actions.retry")}</AppButton>}
          <AppButton type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={tc(`Move video ${index + 1} earlier`)}
            disabled={disabled || clip.edgeIndex === 0} onClick={() => moveClip(clip.edgeId, -1)}><ArrowUp size={14} /></AppButton>
          <AppButton type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={tc(`Move video ${index + 1} later`)}
            disabled={disabled || clip.edgeIndex === edges.length - 1} onClick={() => moveClip(clip.edgeId, 1)}><ArrowDown size={14} /></AppButton>
        </li>;
      }) : <li className="text-xs text-neutral-500">{tc("Connect videos")}</li>}
    </ol>
    <NumericField label={tc("Sequence repeat")} value={number(parameters.repeat, 1)} min={1} max={3} disabled={disabled} onChange={repeat => update({ repeat })} />
    <label className="flex items-center gap-2 text-xs text-neutral-400"><Switch checked={parameters.stripAudio === true} disabled={disabled}
      onCheckedChange={stripAudio => update({ stripAudio })} />{tc("Remove all source and soundtrack audio")}</label>
    <div className="space-y-1 text-xs text-neutral-400">
      <span className="block">{ko ? "사운드트랙" : "Soundtrack"}</span>
      <span className="block truncate text-neutral-200">{soundtrack.data ? getMediaAssetName(soundtrack.data) : ko ? "오디오 포트에 연결" : "Connect to the audio port"}</span>
      {soundtrack.isError && <AppButton type="button" variant="ghost" size="sm" onClick={() => { void soundtrack.refetch(); }}>{t("actions.retry")}</AppButton>}
    </div>
  </div>;
}

function FramesSettings({ nodeId }: { nodeId: string }) {
  const tc = useCanvasTranslation(), ko = useLocale() === "ko";
  const { parameters, disabled, update } = useMediaEditParameters(nodeId, "edit.video.extractFrames");
  const sourceId = useSpaceResolvedInput(nodeId, inputs => inputs.inputAssetId(nodeId, "video"));
  const source = useMediaAsset(sourceId);
  return <div className="space-y-3 text-xs text-neutral-400" data-space-frames-settings="">
    <p>{ko ? "타임라인에서 위치를 고른 뒤 실행하면 해당 프레임을 추출합니다." : "Choose a timeline position, then run to extract that frame."}</p>
    <NumericField label={tc("Frame time")} value={number(parameters.timestampMs, 0) / 1000} min={0}
      max={source.data?.durationMs ? Math.min(600, source.data.durationMs / 1000) : 600} step={0.001} unit="s" disabled={disabled}
      onChange={seconds => update({ timestampMs: Math.round(seconds * 1000) })} />
    {source.data && <p className="truncate text-neutral-200">{getMediaAssetName(source.data)}</p>}
  </div>;
}

/** Panel contents only; SpaceNodeInspector owns selection and the common portal. */
export function SpaceMediaEditInspector({ nodeId }: { nodeId: string }) {
  const kind = useSpaceSelector(state => state.nodeById.get(nodeId)?.kind);
  if (kind === "edit.image.resize") return <ResizeSettings nodeId={nodeId} />;
  if (kind === "edit.video.stitch") return <StitchSettings nodeId={nodeId} />;
  if (kind === "edit.video.extractFrames") return <FramesSettings nodeId={nodeId} />;
  return null;
}
