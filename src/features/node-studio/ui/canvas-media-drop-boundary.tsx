"use client";
import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileUp } from "lucide-react";
import { useLocale } from "next-intl";
import { droppedMediaType, isFileDrag, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import { nodeBananaNodeGeometry } from "../model/node-banana-node-inventory";
import styles from "./node-banana-studio.module.css";

type Preview = { x: number; y: number; zoom: number; type: "image" | "audio" | "video"; count: number };
export function CanvasMediaDropBoundary({ children, writable, contextId, onError, onFilesDrop, busy = false }: {
  children: ReactNode; writable: boolean; contextId: string; onError?: (error: Error) => void;
  onFilesDrop?: (files: File[], position: { x: number; y: number }) => void; busy?: boolean;
}) {
  const ko = useLocale() === "ko";
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    const clear = () => setPreview(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    window.addEventListener("dragend", clear); window.addEventListener("drop", clear); window.addEventListener("blur", clear); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); window.removeEventListener("blur", clear); window.removeEventListener("keydown", escape); };
  }, []);
  const canvasFor = (event: DragEvent<HTMLDivElement>) => {
    if (!writable || busy || document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') || !(event.target instanceof Element) || event.target.closest("input, textarea, select, button, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='dialog'], [role='alertdialog']")) return null;
    const canvas = event.target.closest<HTMLElement>('[data-node-banana-component="WorkflowCanvas"]');
    return canvas?.getAttribute("aria-busy") === "true" ? null : canvas;
  };
  const ghost = writable && preview && <div aria-hidden="true" data-space-drop-preview="" className={styles.dropPreview}
    style={{ left: preview.x, top: preview.y, width: nodeBananaNodeGeometry[("input." + preview.type) as "input.image" | "input.audio" | "input.video"].width, height: nodeBananaNodeGeometry[("input." + preview.type) as "input.image" | "input.audio" | "input.video"].height, transform: "scale(" + preview.zoom + ")" }}>
    <div className={styles.dropPreviewHeader}><FileUp size={16} />{ko ? "파일 업로드" : "Upload file"}{preview.count > 1 && " ×" + preview.count}</div>
    <div className={styles.dropPreviewBody}><FileUp size={36} /><span>{ko ? "놓아서 업로드" : "Drop to upload"}</span></div>
    <span className={styles.dropPreviewPort} />
  </div>;
  return <div key={contextId} style={{ display: "contents" }}
    onDragOverCapture={event => {
      if (!isFileDrag(event.dataTransfer)) return;
      const canvas = canvasFor(event);
      const items = Array.from(event.dataTransfer.items ?? []).filter(item => item.kind === "file");
      const known = items.find(item => item.type !== "" && item.type !== "application/octet-stream");
      const type = known ? droppedMediaType(known.type) : "image";
      if (!canvas || !type || items.some(item => item.type && item.type !== "application/octet-stream" && !droppedMediaType(item.type))) {
        setPreview(null); event.preventDefault(); event.dataTransfer.dropEffect = "none"; return;
      }
      const transform = getComputedStyle(canvas.querySelector(".react-flow__viewport") ?? canvas).transform;
      const matrix = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
      const zoom = matrix && Number.isFinite(matrix[0]) && matrix[0] > 0 ? matrix[0] : 1;
      setPreview({ x: event.clientX, y: event.clientY, zoom, type, count: Math.max(1, items.length) });
    }}
    onDragLeaveCapture={event => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      const canvas = event.target instanceof Element ? event.target.closest('[data-node-banana-component="WorkflowCanvas"]') : null;
      const rect = canvas?.getBoundingClientRect();
      if (!rect || event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) setPreview(null);
    }}
    onDropCapture={event => {
      setPreview(null);
      if (!isFileDrag(event.dataTransfer)) return;
      const canvas = canvasFor(event);
      const original = Array.from(event.dataTransfer.files);
      const files = original.map(normalizeDroppedMediaFile);
      if (!canvas || !files.length || files.some(file => file === null)) {
        event.preventDefault(); event.stopPropagation();
        if (canvas) onError?.(new Error(ko ? "지원하지 않는 파일 형식입니다." : "Unsupported file type."));
        return;
      }
      if (onFilesDrop) {
        event.preventDefault(); event.stopPropagation();
        // Same unsnapped viewport transform used by React Flow's screenToFlowPosition.
        const pane = canvas.querySelector<HTMLElement>(".react-flow") ?? canvas;
        const viewport = canvas.querySelector<HTMLElement>(".react-flow__viewport");
        const matrix = getComputedStyle(viewport ?? pane).transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
        const zoom = matrix && Number.isFinite(matrix[0]) && matrix[0] > 0 ? matrix[0] : 1;
        const rect = pane.getBoundingClientRect();
        onFilesDrop(files as File[], { x: (event.clientX - rect.left - (matrix?.[4] ?? 0)) / zoom,
          y: (event.clientY - rect.top - (matrix?.[5] ?? 0)) / zoom });
      }
    }}>
    {children}
    {ghost && createPortal(ghost, document.body)}
  </div>;
}
