"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AudioLines, FolderOpen, Search, X } from "lucide-react";

import { useMediaAssets } from "@/features/media-assets/hook/use-media-assets";
import type { MediaAssetCategory, MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import { cn } from "@/shared/lib/utils";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogIconButton,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";

function AssetPreview({ asset }: { asset: MediaAssetDto }) {
  if (asset.type === "audio") {
    return (
      <div className="flex aspect-video items-center justify-center rounded bg-black/35 text-neutral-500">
        <AudioLines className="h-7 w-7" aria-hidden="true" />
      </div>
    );
  }
  if (asset.type === "video") {
    return <video muted playsInline preload="metadata" src={asset.url} className="aspect-video w-full rounded bg-black/45 object-contain" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.url} alt="" loading="lazy" className="aspect-video w-full rounded bg-black/45 object-contain" />;
}

export function NodeBananaInputHistoryControl({
  mediaType,
  selectedAssetId,
  writable,
  onSelect,
  open: controlledOpen,
  onOpenChange,
}: {
  nodeId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  mediaType: MediaType;
  selectedAssetId: string | null;
  writable: boolean;
  onSelect: (assetId: string) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value); };
  const [category, setCategory] = useState<MediaAssetCategory>("uploads");
  const panelId = useId();
  const categories = ["uploads", "generated", "edited"] as const;
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const assetsQuery = useMediaAssets(mediaType, open, category);
  const assets = useMemo(
    () => assetsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [assetsQuery.data],
  );
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? assets.filter((asset) => `${asset.id} ${asset.mimeType} ${asset.origin}`.toLowerCase().includes(query))
      : assets;
  }, [assets, search]);

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      {controlledOpen === undefined ? <button
        type="button"
        ref={triggerRef}
        className="node-banana-input-assets nodrag nopan absolute left-2 top-2 z-20 flex h-8 items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900/90 px-2 text-xs text-neutral-200 disabled:opacity-45"
        disabled={!writable}
        aria-label={selectedAssetId ? "Replace asset" : "Assets"}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="h-4 w-4" aria-hidden="true" />{selectedAssetId ? "Replace" : "Assets"}
      </button> : null}
      <AppDialog open={open} onOpenChange={close}>
        <AppDialogContent
          size="md"
          surface="editor"
          padding="none"
          className="z-[10001] flex max-h-[min(720px,calc(100vh-2rem))] flex-col overflow-hidden"
          aria-label="Assets"
          data-node-banana-component="HistoryAssetDialog"
        >
          <AppDialogHeader className="flex-row items-center border-b border-neutral-700 px-4 py-3">
            <div>
              <AppDialogTitle className="m-0 text-sm">Assets</AppDialogTitle>
              <AppDialogDescription className="mt-0.5 text-xs text-neutral-500">Choose a {mediaType} asset</AppDialogDescription>
            </div>
            <AppDialogClose asChild>
              <AppDialogIconButton type="button" aria-label="Close assets" className="ml-auto border-0 text-neutral-400 hover:bg-neutral-700 hover:text-white">
                <X className="h-4 w-4" aria-hidden="true" />
              </AppDialogIconButton>
            </AppDialogClose>
          </AppDialogHeader>
          <div role="tablist" aria-label="Asset source" className="flex gap-2 border-b border-neutral-700 px-3 py-2">
            {categories.map((value, index) => <button key={value} id={`${panelId}-${value}`} type="button" role="tab" aria-controls={panelId} tabIndex={category === value ? 0 : -1} aria-selected={category === value} className={cn("rounded-full px-3 py-2 text-sm", category === value ? "bg-white text-black" : "text-neutral-400 hover:bg-neutral-800")} onClick={() => { setCategory(value); setSearch(""); }} onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
              if (next === null) return;
              event.preventDefault(); setCategory(categories[next]); setSearch("");
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          </div>
          <div className="border-b border-neutral-700 p-3">
            <label className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950/55 px-3">
              <Search className="h-4 w-4 text-neutral-500" aria-hidden="true" />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loaded assets..." className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" />
            </label>
          </div>
          <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${category}`} tabIndex={0} aria-busy={assetsQuery.isFetching} className="grid min-h-40 flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3">
            {assetsQuery.isError ? (
              <div className="col-span-full text-center text-xs text-neutral-400">
                <p role="alert">Could not load assets. Please try again.</p>
                <button
                  type="button"
                  className="mt-2 rounded border border-neutral-600 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={assetsQuery.isFetching}
                  onClick={() => void assetsQuery.refetch()}
                >
                  {assetsQuery.isFetching ? "Retrying..." : "Retry"}
                </button>
              </div>
            ) : null}
            {visibleAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                aria-pressed={asset.id === selectedAssetId}
                className={cn(
                  "min-w-0 rounded-lg border p-2 text-left hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  asset.id === selectedAssetId ? "border-primary/60 bg-primary/5" : "border-neutral-700 bg-neutral-900/35",
                )}
                disabled={!writable}
                onClick={() => { if (writable) { onSelect(asset.id); if (controlledOpen === undefined) close(false); } }}
              >
                <AssetPreview asset={asset} />
                <span className="mt-1.5 block truncate text-[10px] text-neutral-400">{asset.mimeType}</span>
              </button>
            ))}
            {assetsQuery.isLoading ? <p role="status" className="col-span-full py-8 text-center text-xs text-neutral-400">Loading...</p> : null}
            {!assetsQuery.isLoading && !assetsQuery.isError && visibleAssets.length === 0 ? <p className="col-span-full py-8 text-center text-xs text-neutral-400">No assets in this category.</p> : null}
          </div>
          {assetsQuery.hasNextPage ? (
            <footer className="border-t border-neutral-700 p-3 text-right">
              <button type="button" className="rounded border border-neutral-600 px-3 py-1.5 text-xs hover:bg-neutral-700" disabled={assetsQuery.isFetching} onClick={() => void assetsQuery.fetchNextPage()}>
                Load more
              </button>
            </footer>
          ) : null}
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
