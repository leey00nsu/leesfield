"use client";
import { VariantImage } from "@/shared/media-assets/variant-image";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { X } from "lucide-react";

import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";

export function NodeBananaOperationPreview({
  asset,
  expectedType,
  emptyLabel,
  output,
  onClearOutput,
  grid,
}: {
  asset: MediaAssetDto | null | undefined;
  expectedType: MediaType;
  emptyLabel: string;
  output?: boolean;
  onClearOutput?: () => void;
  grid?: { rows: number; columns: number };
}) {
  const tc = useCanvasTranslation();
  return (
    <div
      className="relative min-h-36 overflow-hidden rounded bg-neutral-900/40"
      data-node-banana-component="OperationPreview"
      data-preview-state={output ? "output" : asset ? "input" : "empty"}
    >
      {asset?.type === "image" ? (
        <VariantImage asset={asset} alt={output ? tc("Operation result") : tc("Operation source")} className="absolute inset-0 h-full w-full object-contain" />
      ) : asset?.type === "video" ? (
        <video src={asset.url} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
      ) : asset?.type === "audio" ? (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <audio src={asset.url} controls preload="metadata" className="w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-600">
          <span className="px-4 text-center text-[10px] text-neutral-500">{emptyLabel}</span>
        </div>
      )}

      {asset && asset.type !== expectedType ? (
        <p className="absolute inset-x-2 bottom-2 rounded bg-red-950/80 px-2 py-1 text-[10px] text-red-200" role="alert">{tc("Expected")}{expectedType}{tc(", received")}{asset.type}
        </p>
      ) : null}
      {asset?.type === "image" && grid ? (
        <div
          className="pointer-events-none absolute inset-0 grid"
          style={{
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          }}
          aria-hidden="true"
          data-node-banana-component="GridPreview"
        >
          {Array.from({ length: grid.rows * grid.columns }, (_, index) => (
            <span key={index} className="border border-primary/55" />
          ))}
        </div>
      ) : null}
      {output && onClearOutput ? (
        <button
          type="button"
          aria-label={tc("Clear result")}
          title={tc("Clear result")}
          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-neutral-900/80 text-neutral-400 transition-colors hover:bg-red-600/80 hover:text-white"
          onClick={onClearOutput}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
