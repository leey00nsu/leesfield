"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { spaceOutputConnection } from "../../model/space-editor-output";
import { useSpaceEditor, useSpaceInputRevision, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector, useSpaceVideoPreview } from "../space-editor-provider";
import { SpaceMediaPreview } from "./space-media-preview";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-output.module.css";

/** Current Output priority is explicit mediaType, otherwise audio → video → image. */
export function SpaceOutputNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes");
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId)), hovered = useSpaceSelector(state => state.hoveredNodeId === nodeId);
  const zoom = useSpaceSelector(state => state.viewport.zoom), writable = useSpaceSelector(state => state.writable);
  const revision = useSpaceInputRevision(nodeId), epoch = useSpaceViewSelector(state => state.epoch);
  const source = useSpaceResolvedInput(nodeId, inputs => node ? spaceOutputConnection(node, inputs) : null);
  const assetId = source?.assetId ?? null;
  const query = useMediaAsset(assetId), asset = query.data?.id === assetId ? query.data : undefined;
  const sourceKey = JSON.stringify([epoch, revision, assetId, asset?.version, asset?.updatedAt, asset?.url]);
  const body = useRef<HTMLDivElement>(null);
  const video = useSpaceVideoPreview(nodeId, source?.type === "video", asset?.type === "video" ? asset : undefined);
  const detach = () => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    // A previous action must not clear a replacement source or a reloaded Space.
    if (!source || current?.kind !== "output.single" || !state.writable || state.disposed
      || scope.view.getState().epoch !== epoch || scope.inputs.inputRevision(nodeId) !== revision) return;
    const active = spaceOutputConnection(current, scope.inputs);
    if (active?.edgeId !== source.edgeId || active.assetId !== source.assetId || active.type !== source.type) return;
    const result = scope.session.dispatch({ type: "batch", commands: [
      { type: "edge.disconnect", edgeId: active.edgeId },
      // Keep an automatic mixed Output empty after clearing its displayed type;
      // hidden inputs remain wired without silently replacing the removed media.
      { type: "node.config.patch", nodeId, patch: { mediaType: active.type } },
    ] });
    if (result.ok && result.changed) body.current?.focus();
  };
  if (node?.kind !== "output.single") return null;
  const clearLabel = tc(source?.type === "audio" ? "Remove audio" : source?.type === "video" ? "Remove video" : "Remove image");
  return <SpaceNodeFrame nodeId={nodeId} fullBleed contentClassName={styles.content}>
    <div ref={body} tabIndex={-1} className={styles.body} data-space-output="" data-output-type={source?.type} data-output-asset={assetId ?? undefined}>
      {asset ? <SpaceMediaPreview key={sourceKey} asset={asset} selected={selected} hovered={hovered} zoom={zoom}
        onOpen={(asset, trigger, onClosed) => scope.view.getState().services.openMediaDetail?.(nodeId, asset, trigger, onClosed)}
        videoRef={video} />
        : <div className={styles.empty} role="status">{assetId ? t("loading") : tc("Connect input")}</div>}
      {source && <button type="button" className={`${styles.clear} nodrag nopan`} title={clearLabel} aria-label={clearLabel}
        disabled={!writable} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); detach(); }}><X aria-hidden="true" /></button>}
      {assetId && query.isError && <div className={`${styles.error} nodrag nopan nowheel`} role="alert">{t("loadError")}
        <button type="button" onClick={() => { void query.refetch(); }}>{tc("Retry")}</button></div>}
    </div>
  </SpaceNodeFrame>;
}
