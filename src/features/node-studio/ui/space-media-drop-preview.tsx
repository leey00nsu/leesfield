"use client";

import { memo, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FileUp } from "lucide-react";
import { useLocale } from "next-intl";
import { droppedMediaType, isFileDrag } from "@/shared/media-assets/media-file-drop";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";
import { spaceNodeCatalog } from "../model/space-editor-catalog";
import { spaceEditorFormTarget } from "../model/space-editor-interactions";
import styles from "./space-media-drop-preview.module.css";

type SpaceMediaDropPreviewProps = {
  rootRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  /** Read the live viewport without subscribing the canvas to zoom changes. */
  getScale: () => number;
};
type Preview = { x: number; y: number; scale: number; type: MediaType; count: number };

/** Ephemeral drag feedback only; the canvas and media inputs retain ownership of drops. */
export const SpaceMediaDropPreview = memo(function SpaceMediaDropPreview({ rootRef, enabled, getScale }: SpaceMediaDropPreviewProps) {
  const ko = useLocale() === "ko";
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    let internalDrag = false;
    const clear = () => setPreview(null);
    const finish = () => { internalDrag = false; clear(); };
    // Browser drags from nodes, history, or other page content are never file imports.
    const start = () => { internalDrag = true; clear(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    const over = (event: DragEvent) => {
      const data = event.dataTransfer, target = event.target;
      if (internalDrag || !data || !isFileDrag(data) || !(target instanceof Element) || !root.contains(target)
        || spaceEditorFormTarget(target) || root.getAttribute("aria-busy") === "true"
        || document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
        || Array.from(data.types ?? []).some(type => type.startsWith("application/leesfield-"))) {
        clear(); return;
      }
      const items = Array.from(data.items ?? []).filter(item => item.kind === "file");
      const mimeTypes = (items.length ? items : Array.from(data.files ?? [])).map(item => item.type.toLowerCase());
      const known = mimeTypes.filter(type => type && type !== "application/octet-stream");
      if (known.some(type => !droppedMediaType(type))) { clear(); return; }
      const scale = getScale();
      const next: Preview = { x: event.clientX, y: event.clientY, scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        type: droppedMediaType(known[0] ?? "") ?? "image", count: Math.max(1, items.length, data.files?.length ?? 0) };
      setPreview(previous => previous && previous.x === next.x && previous.y === next.y && previous.scale === next.scale
        && previous.type === next.type && previous.count === next.count ? previous : next);
    };
    const leave = (event: DragEvent) => {
      if (event.relatedTarget instanceof Node) {
        if (!root.contains(event.relatedTarget)) clear();
        return;
      }
      const rect = root.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) clear();
    };
    // Capture observes drops even when a media input stops propagation. No event is consumed.
    window.addEventListener("dragover", over, true);
    root.addEventListener("dragleave", leave, true);
    window.addEventListener("dragstart", start, true);
    window.addEventListener("dragend", finish, true);
    window.addEventListener("drop", finish, true);
    window.addEventListener("blur", finish);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      root.removeEventListener("dragleave", leave, true);
      window.removeEventListener("dragstart", start, true);
      window.removeEventListener("dragend", finish, true);
      window.removeEventListener("drop", finish, true);
      window.removeEventListener("blur", finish);
      window.removeEventListener("keydown", escape, true);
      clear();
    };
  }, [rootRef, enabled, getScale]);

  if (!enabled || !preview) return null;
  const geometry = spaceNodeCatalog[`input.${preview.type}`].geometry;
  return createPortal(<div aria-hidden="true" data-space-drop-preview="" className={styles.preview}
    style={{ left: preview.x, top: preview.y, width: geometry.width, height: geometry.height, transform: `scale(${preview.scale})` }}>
    <div className={styles.header}><FileUp size={16} />{ko ? "파일 업로드" : "Upload file"}{preview.count > 1 && ` ×${preview.count}`}</div>
    <div className={styles.body}><FileUp size={36} /><span>{ko ? "놓아서 업로드" : "Drop to upload"}</span></div>
    <span className={styles.port} />
  </div>, document.body);
});
