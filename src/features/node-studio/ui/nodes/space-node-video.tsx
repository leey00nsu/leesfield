"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppButton } from "@/shared/ui/app-button";
import { useNodeExecutions } from "../../hook/use-node-executions";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { updateSpaceNodeAuthoringConfig } from "../../model/space-editor-authoring";
import type { SpaceInputResolver } from "../../model/space-editor-inputs";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector } from "../space-editor-provider";
import { SpaceMediaPreview } from "./space-media-preview";
import { SpaceMediaClearButton } from "./space-media-clear-button";
import { SpaceNodeFrame } from "./space-node-frame";
import { VideoTrimEditor, type VideoFrameCapture } from "./video-trim-editor";
import styles from "./space-node-video.module.css";

const videoKinds = new Set(["edit.video.stitch", "edit.video.trim", "edit.video.extractFrames"]);
const activeStatuses = new Set(["pending", "processing", "uploading"]);
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sourceBinding(inputs: SpaceInputResolver, nodeId: string, portId: string) {
  return JSON.stringify(inputs.incomingEdges(nodeId, portId).map(edge => [edge.id, edge.sourceNodeId, edge.sourcePortId,
    edge.sortOrder, Boolean(edge.hasPause), inputs.edgeAssetIds(edge)]));
}
function videoSourceLifetime(scope: ReturnType<typeof useSpaceEditor>, nodeId: string, portId: string) {
  let revision = -1, snapshot: { binding: string; epoch: number } | undefined;
  const getSnapshot = () => {
    const view = scope.view.getState(), nextRevision = view.inputRevisionByNode.get(nodeId) ?? 0;
    if (!snapshot || revision !== nextRevision || snapshot.epoch !== view.epoch) {
      revision = nextRevision;
      const binding = sourceBinding(scope.inputs, nodeId, portId);
      if (!snapshot || snapshot.binding !== binding || snapshot.epoch !== view.epoch) snapshot = { binding, epoch: view.epoch };
    }
    return snapshot;
  };
  return { getSnapshot, subscribe: (notify: () => void) => scope.view.subscribe(() => {
    const previous = snapshot;
    if (getSnapshot() !== previous) notify();
  }) };
}
function latestExecution(runtime: NodeExecutionDto | undefined, records: readonly NodeExecutionDto[]) {
  const latest = records.reduce<NodeExecutionDto | undefined>((last, row) => !last || row.createdAt > last.createdAt ? row : last, undefined);
  if (!runtime) return latest;
  if (!latest || runtime.createdAt > latest.createdAt) return runtime;
  if (runtime.executionId !== latest.executionId) return latest;
  return activeStatuses.has(runtime.status) && !activeStatuses.has(latest.status) ? latest : runtime;
}

/** The dispatcher supplies node-scoped authoring. Only the Frame runs/cancels work. */
export function SpaceVideoNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), authoring = useNodeAuthoring(), tc = useCanvasTranslation(), t = useTranslations("nodeStudio");
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable), disposed = useSpaceSelector(state => state.disposed);
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId)), hovered = useSpaceSelector(state => state.hoveredNodeId === nodeId);
  const graphId = useSpaceSelector(state => state.id), persisted = useSpaceSelector(state => state.persistedNodeIds.has(nodeId));
  const runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId));
  const kind = node?.kind, validKind = Boolean(kind && videoKinds.has(kind) && node?.configVersion === 1);
  const sourcePort = kind === "edit.video.stitch" ? "clips" : "video";
  const sourceId = useSpaceResolvedInput(nodeId, inputs => validKind && kind !== "edit.video.stitch" ? inputs.inputAssetId(nodeId, sourcePort) : null);
  const sourceQuery = useMediaAsset(sourceId), source = sourceQuery.data;
  // A cleared selection stays empty; historical executions must not restore it.
  const resultQuery = useMediaAsset(validKind && kind === "edit.video.stitch" ? node?.selectedOutputAssetId ?? null : null);
  const result = resultQuery.data?.type === "video" ? resultQuery.data : undefined;
  const media = kind === "edit.video.stitch" ? result : source;
  const stitchResultSelected = kind === "edit.video.stitch" && Boolean(node?.selectedOutputAssetId);
  const config = record(node?.config), parameters = record(config.parameters);
  const history = useNodeExecutions(graphId, nodeId, persisted && validKind && !disposed);
  const isOperation = (execution: NodeExecutionDto) => execution.executionKind === "media_operation" && execution.graphNodeId === nodeId;
  const execution = latestExecution(runtime?.execution && isOperation(runtime.execution) ? runtime.execution : undefined, (history.data ?? []).filter(isOperation));
  const canEdit = validKind && writable && !disposed && authoring.writable !== false;
  // Observe semantic source changes synchronously, including A→B→A before React's next render.
  const sourceLifetime = useMemo(() => videoSourceLifetime(scope, nodeId, sourcePort), [scope, nodeId, sourcePort]);
  const bindingSnapshot = useSyncExternalStore(sourceLifetime.subscribe, sourceLifetime.getSnapshot, sourceLifetime.getSnapshot);
  const sourceKey = JSON.stringify([sourceId, source?.version, source?.updatedAt, source?.url]);
  const sourceToken = useMemo(() => ({ bindingSnapshot, sourceKey }), [bindingSnapshot, sourceKey]);
  const mountedSource = useRef<object | null>(null);
  const frameCapture = useRef<VideoFrameCapture>(null);
  useLayoutEffect(() => {
    mountedSource.current = sourceToken;
    return () => { if (mountedSource.current === sourceToken) mountedSource.current = null; };
  }, [sourceToken]);

  const updateParameters = useCallback((patch: Record<string, unknown>) => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    if (!state.writable || state.disposed || !current || current.kind !== kind || current.configVersion !== 1 || !videoKinds.has(current.kind)) return false;
    const currentConfig = record(current.config);
    const result = scope.session.transact(document => updateSpaceNodeAuthoringConfig(document, nodeId, current.config,
      { ...currentConfig, parameters: { ...record(currentConfig.parameters), ...patch } } as CanonicalJsonValue, scope.view.getState().catalog),
    { origin: "user", label: "video.parameters" });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
    return result.ok;
  }, [scope, nodeId, kind]);
  // Stable during parameter edits, selection, movement and unrelated query updates.
  // A callback from a previous source/Space lifetime cannot apply an old timeline range.
  const changeTrim = useCallback((patch: Record<string, unknown>) => {
    if (mountedSource.current !== sourceToken || sourceLifetime.getSnapshot() !== bindingSnapshot) return;
    updateParameters(patch);
  }, [bindingSnapshot, sourceLifetime, sourceToken, updateParameters]);
  const changeFrame = useCallback((timestampMs: number) => {
    if (mountedSource.current !== sourceToken || sourceLifetime.getSnapshot() !== bindingSnapshot) return false;
    return updateParameters({ timestampMs });
  }, [bindingSnapshot, sourceLifetime, sourceToken, updateParameters]);
  useLayoutEffect(() => {
    if (kind !== "edit.video.extractFrames") return;
    return scope.registerNodeRunPreparation(nodeId, () => {
      if (!sourceId || source?.type !== "video" || !frameCapture.current) return false;
      return changeFrame(frameCapture.current.timestampMs());
    });
  }, [scope, nodeId, kind, sourceId, source?.type, changeFrame]);

  if (!node || !validKind) return null;
  return <SpaceNodeFrame nodeId={nodeId} fullBleed={kind !== "edit.video.trim"} contentClassName={styles.content}>
    <div className={`${styles.body} nodrag nopan nowheel`} data-space-video={kind}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <SpaceMediaClearButton nodeId={nodeId} portIds={kind === "edit.video.stitch" ? stitchResultSelected ? [] : ["clips", "soundtrack"] : ["video"]}
        clearOutput={stitchResultSelected} label={stitchResultSelected ? tc("Clear result") : undefined} />
      {kind === "edit.video.trim" ? <VideoTrimEditor key={sourceKey} source={source} output={undefined} externalResults active={selected}
        startMs={number(parameters.startMs, 0)} endMs={number(parameters.endMs, 5_000)} stripAudio={parameters.stripAudio === true}
        writable={canEdit} onChange={changeTrim} /> : kind === "edit.video.extractFrames" && source?.type === "video" ?
        <VideoTrimEditor key={sourceKey} source={source} output={undefined} externalResults active={selected}
          startMs={0} endMs={source.durationMs ?? 600_000} stripAudio={false} writable={canEdit} onChange={() => {}}
          frame={{ timestampMs: number(parameters.timestampMs, 0), onChange: changeFrame }} frameCaptureRef={frameCapture} />
        : <div className={styles.media} role="region" aria-label={tc(kind === "edit.video.stitch" ? "Operation result" : "Operation source")}>
        {media?.type === "video"
          ? <SpaceMediaPreview asset={media} selected={selected} hovered={hovered}
            onOpen={(asset, trigger, onClosed) => scope.view.getState().services.openMediaDetail?.(nodeId, asset, trigger, onClosed)} />
          : <span className={styles.empty}>{tc(kind === "edit.video.stitch" ? "No result yet" : "Connect a video")}</span>}
      </div>}
      {sourceQuery.isError && <div className={styles.feedback} role="alert"><span>{t("mediaNodes.loadError")}</span>
        <AppButton type="button" variant="ghost" size="sm" onClick={() => { void sourceQuery.refetch(); }}>{t("actions.retry")}</AppButton></div>}
      {resultQuery.isError && <div className={styles.feedback} role="alert"><span>{t("mediaNodes.loadError")}</span>
        <AppButton type="button" variant="ghost" size="sm" onClick={() => { void resultQuery.refetch(); }}>{t("actions.retry")}</AppButton></div>}
      {history.isError && <div className={styles.feedback} role="alert"><span>{t("execution.loadError")}</span>
        <AppButton type="button" variant="ghost" size="sm" onClick={() => { void history.refetch(); }}>{t("actions.retry")}</AppButton></div>}
      {execution?.status === "failed" && <div className={styles.feedback} role="alert">
        <span>{t("execution.status.failed")}{execution.errorCode ? ` · ${execution.errorCode}` : ""}</span>
      </div>}
    </div>
  </SpaceNodeFrame>;
}
