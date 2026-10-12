"use client";
import { useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { MediaAssetPicker } from "@/features/media-assets/ui/media-asset-picker";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";

export function NodeBananaInputHistoryControl({
  mediaType, selectedAssetId, writable, onSelect, open: controlledOpen, onOpenChange,
}: {
  nodeId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  mediaType: MediaType;
  selectedAssetId: string | null;
  writable: boolean;
  onSelect: (assetId: string) => void;
}) {
  const tc = useCanvasTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  return (
    <>
      {controlledOpen === undefined && (
        <button type="button" ref={triggerRef}
          className="node-banana-input-assets nodrag nopan absolute left-2 top-2 z-20 flex h-8 items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900/90 px-2 text-xs text-neutral-200 disabled:opacity-45"
          disabled={!writable}
          aria-label={selectedAssetId ? tc("Replace asset") : tc("Assets")}
          onClick={() => setOpen(true)}>
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          {selectedAssetId ? tc("Replace") : tc("Assets")}
        </button>
      )}
      <MediaAssetPicker
        mediaType={mediaType} selectedAssetId={selectedAssetId} writable={writable}
        open={open} onOpenChange={close}
        onSelect={asset => {
          onSelect(asset.id);
          if (controlledOpen === undefined) close(false);
        }}
      />
    </>
  );
}
