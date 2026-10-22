"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { ReactCompareSlider } from "react-compare-slider";
import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { useSpaceResolvedInput, useSpaceSelector } from "../space-editor-provider";
import { SpaceNodeFrame } from "./space-node-frame";
import { SpaceMediaClearButton } from "./space-media-clear-button";
import styles from "./space-node-compare.module.css";

/** A comparison is local presentation; its position never enters the graph. */
export function SpaceCompareNode({ nodeId }: { nodeId: string }) {
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes");
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const validKind = node?.kind === "inspect.imageCompare";
  // The resolver owns output-port/index and representative-result fallback rules.
  // Do not compact the two sides into an ordered list: an empty A must stay A.
  const { beforeId, afterId } = useSpaceResolvedInput(nodeId, inputs => ({
    beforeId: validKind ? inputs.inputAssetId(nodeId, "before") : null,
    afterId: validKind ? inputs.inputAssetId(nodeId, "after") : null,
  }));
  const beforeQuery = useMediaAsset(beforeId), afterQuery = useMediaAsset(afterId);
  const before = beforeQuery.data?.type === "image" ? beforeQuery.data : null;
  const after = afterQuery.data?.type === "image" ? afterQuery.data : null;
  const ready = Boolean(before && after);
  const slider = useRef<ComponentRef<typeof ReactCompareSlider>>(null), composing = useRef(false);
  useEffect(() => {
    composing.current = false;
    const handle = slider.current?.handleContainer;
    if (!handle) return;
    // The package's handle is a button without a type. Keep it safe inside forms.
    handle.type = "button";
    handle.setAttribute("aria-label", tc("Image Compare"));
  }, [ready, tc]);
  if (!node || node.kind !== "inspect.imageCompare") return null;
  return <SpaceNodeFrame nodeId={nodeId} fullBleed contentClassName={styles.content}>
    <div className={styles.body} data-space-compare>
      <SpaceMediaClearButton nodeId={nodeId} portIds={["before", "after"]} />
      {before && after ? <div className={cn(styles.comparison, "nodrag nopan nowheel")}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDownCapture={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
            event.preventDefault(); event.stopPropagation();
          }
        }} onKeyDown={event => event.stopPropagation()}>
        <ReactCompareSlider ref={slider} className={styles.slider} portrait={false}
          itemOne={<VariantImage asset={before} alt={tc("Image A")} className={styles.image} loading="lazy" decoding="async" draggable={false} />}
          itemTwo={<VariantImage asset={after} alt={tc("Image B")} className={styles.image} loading="lazy" decoding="async" draggable={false} />}
          style={{ width: "100%", height: "100%" }} />
        <span className={cn(styles.label, styles.before)} aria-hidden="true">A</span>
        <span className={cn(styles.label, styles.after)} aria-hidden="true">B</span>
      </div> : <div className={styles.empty} role="status" aria-live="polite">
        <span>{tc(!before && !after ? "Connect 2 images to compare" : "Connect another image to compare")}</span>
        {before && <small>{tc("Image A connected")}</small>}
        {after && <small>{tc("Image B connected")}</small>}
        {((beforeId && beforeQuery.isLoading) || (afterId && afterQuery.isLoading)) && <small>{t("loading")}</small>}
      </div>}
      {([beforeQuery, afterQuery] as const).map((query, index) => query.isError ? <div key={index} className={styles.error} role="alert">
        {tc(index === 0 ? "Image A" : "Image B")}: {t("loadError")}
        <button type="button" className="nodrag nopan" onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); void query.refetch(); }}>{tc("Retry")}</button>
      </div> : null)}
    </div>
  </SpaceNodeFrame>;
}
