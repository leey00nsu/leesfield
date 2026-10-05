"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

export function SpaceInputMediaChooser({ open, onOpenChange, onUpload, renderAssets, restoreFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onUpload: () => void;
  renderAssets: (options: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  restoreFocus: () => void;
}) {
  const tc = useCanvasTranslation(), menu = useRef<HTMLDivElement>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); onOpenChange(false); restoreFocus();
    };
    const blur = () => onOpenChange(false);
    menu.current?.querySelector("button")?.focus();
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
    };
  }, [open, onOpenChange, restoreFocus]);
  return <>
    {open && <div ref={menu} data-space-media-chooser="" role="group" aria-label={tc("Upload")}
      className="nodrag nopan absolute inset-px z-20 flex flex-col items-center justify-center gap-3 rounded-[7px] bg-neutral-900"
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <button type="button" className="h-10 w-32 rounded-md border border-neutral-600 bg-neutral-900 px-4 text-xs text-neutral-200"
        onClick={() => { onOpenChange(false); onUpload(); }}>{tc("Upload")}</button>
      <button type="button" className="flex h-10 w-32 items-center justify-center gap-2 rounded-md border border-neutral-600 bg-neutral-900 px-4 text-xs text-neutral-200"
        onClick={() => { onOpenChange(false); setAssetsOpen(true); }}><FolderOpen className="h-4 w-4" />{tc("Assets")}</button>
      <button type="button" className="text-xs text-neutral-400" onClick={() => { onOpenChange(false); restoreFocus(); }}>{tc("Cancel")}</button>
    </div>}
    {renderAssets({ open: assetsOpen, onOpenChange: next => { setAssetsOpen(next); if (!next) requestAnimationFrame(restoreFocus); } })}
  </>;
}
