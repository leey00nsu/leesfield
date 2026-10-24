"use client";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useViewport } from "@xyflow/react";
import { containedMediaBox, mediaEditBarPosition } from "../../model/media-crop-geometry";
import { useSpaceEditor, useSpaceViewSelector } from "../space-editor-provider";
import { useSpaceMediaEdit, useSpaceMediaEditDraft } from "../space-media-edit-provider";
import { MediaCropEditor } from "./media-crop-editor";
import { MediaTrimEditor } from "./media-trim-editor";
import styles from "./media-edit.module.css";
import { AppCanvasOverlayProvider } from "@/shared/ui/app-overlay-scope";

export function SpaceMediaEditOverlay() {
  const draft = useSpaceMediaEditDraft(), controller = useSpaceMediaEdit(), scope = useSpaceEditor();
  const viewport = useViewport(), epoch = useSpaceViewSelector(state => state.epoch);
  const nodeId = draft?.nodeId, assetId = draft?.asset.id, sourceWidth = draft?.asset.width, sourceHeight = draft?.asset.height;
  const [layout, setLayout] = useState<{ box: { x: number; y: number; width: number; height: number }; anchor: { x: number; y: number; width: number; height: number }; body: { left: number; top: number; width: number; height: number }; width: number; height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!nodeId || !sourceWidth || !sourceHeight) return;
    const node = document.querySelector<HTMLElement>('[data-space-node-id="' + CSS.escape(nodeId) + '"]');
    const body = node?.querySelector<HTMLElement>("[data-space-node-body]"), canvas = node?.closest("[data-space-canvas]");
    if (!body) return;
    const measure = () => {
      const r = body.getBoundingClientRect();
      const nodeTop = Math.min(r.top, node?.querySelector("[data-space-node-header]")?.getBoundingClientRect().top ?? r.top);
      const appTop = Math.max(canvas?.getBoundingClientRect().top ?? 0, document.querySelector("[data-space-workspace-header]")?.getBoundingClientRect().bottom ?? 64);
      const floatingTop = document.querySelector("[data-space-floating-bar]")?.getBoundingClientRect().top;
      setLayout({ box: containedMediaBox({ x: r.left, y: r.top, width: r.width, height: r.height }, sourceWidth, sourceHeight),
        anchor: { x: r.left, y: nodeTop, width: r.width, height: r.bottom - nodeTop },
        body: { left: r.left, top: r.top, width: r.width, height: r.height },
        width: window.innerWidth, height: floatingTop && floatingTop > 0 ? Math.min(window.innerHeight, floatingTop + 80) : window.innerHeight, top: appTop });
    };
    measure();
    node?.querySelectorAll<HTMLVideoElement>("video").forEach(video => video.pause());
    const observer = new ResizeObserver(measure); observer.observe(body);
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [nodeId, assetId, sourceWidth, sourceHeight, viewport.x, viewport.y, viewport.zoom, epoch]);
  if (!draft || !controller || !layout) return null;
  const trimming = draft.edit.kind === "video.trim";
  const bar = mediaEditBarPosition(layout.anchor, trimming ? 959 : draft.edit.kind === "image.crop" ? 250 : 270, trimming ? 73 : 50, layout, draft.edit.kind === "image.crop", layout.top);
  const close = () => { controller.close(); document.querySelector<HTMLElement>("[data-space-canvas]")?.focus({ preventScroll: true }); };
  return createPortal(<AppCanvasOverlayProvider><div className={styles.overlay} data-space-media-edit={draft.edit.kind}
    onPaste={event => event.stopPropagation()} onDrop={event => event.stopPropagation()}>
    <div style={{ position: "absolute", ...layout.body, background: "#111" }} aria-hidden="true" />
    {draft.edit.kind === "video.trim" ? <MediaTrimEditor key={draft.nodeId + draft.asset.id} asset={draft.asset} edit={draft.edit} onChange={controller.change}
      onCancel={close} onConfirm={() => { void controller.confirm().catch(error => scope.view.getState().services.onError?.(error)); }}
      stageStyle={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height }} barStyle={bar} /> :
    <MediaCropEditor key={draft.nodeId + draft.asset.id} asset={draft.asset} edit={draft.edit} preset={draft.preset} onChange={controller.change}
      onCancel={close} onConfirm={() => { void controller.confirm().catch(error => scope.view.getState().services.onError?.(error)); }}
      stageStyle={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height }}
      barStyle={bar} />}
  </div></AppCanvasOverlayProvider>, document.body);
}
