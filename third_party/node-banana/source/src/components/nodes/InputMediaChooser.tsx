"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { HostedInputHistory } from "../../leesfield/upstream-node-host";
import { useCanvasTranslation } from "../../leesfield/localization";
import { PortIcon } from "../../leesfield/port-handle";

export function InputMediaChooser({ nodeId, mediaType, selectedAssetId, open, onOpenChange, onUpload, onAssets, triggerRef }: {
  nodeId: string;
  mediaType: "image" | "video";
  selectedAssetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: () => void;
  onAssets?: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const tc = useCanvasTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !menu?.contains(event.target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      triggerRef?.current?.focus();
    };
    const blur = () => onOpenChange(false);
    menu?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
    };
  }, [open, onOpenChange, triggerRef]);

  return <>
    {open && <div ref={menuRef} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-neutral-900 nodrag nopan" style={{ backgroundColor: "#171717" }} role="group" aria-label={tc(mediaType === "image" ? "Choose image" : "Choose video")}>
      <button type="button" className="h-10 w-32 rounded-md border border-neutral-600 bg-neutral-900 px-4 text-xs text-neutral-200" onClick={() => { onOpenChange(false); onUpload(); }}>{tc("Upload")}</button>
      <button type="button" className="flex h-10 w-32 items-center justify-center gap-2 rounded-md border border-neutral-600 bg-neutral-900 px-4 text-xs text-neutral-200" onClick={() => { onOpenChange(false); if (onAssets) onAssets(); else setAssetsOpen(true); }}><PortIcon type="assets"/>{tc("Assets")}</button>
      <button type="button" className="text-xs text-neutral-400" onClick={() => { onOpenChange(false); triggerRef?.current?.focus(); }}>{tc("Cancel")}</button>
    </div>}
    {!onAssets && <HostedInputHistory nodeId={nodeId} mediaType={mediaType} selectedAssetId={selectedAssetId} open={assetsOpen} onOpenChange={nextOpen => { setAssetsOpen(nextOpen); if (!nextOpen) requestAnimationFrame(() => triggerRef?.current?.focus()); }} />}
  </>;
}
