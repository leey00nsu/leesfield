"use client";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/brand/tabs/tabs";
import { AppInput } from "@/shared/ui/app-input";
import { VariantImage } from "@/shared/media-assets/variant-image";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useMemo, useRef, useState } from "react";
import { AudioLines, FolderOpen, Search, X } from "lucide-react";

import { useMediaAssets } from "@/features/media-assets/hook/use-media-assets";
import type {
  MediaAssetCategory,
  MediaAssetDto,
  MediaType,
} from "@/shared/media-assets/media-asset-contract";
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
    return (
      <video
        muted
        playsInline
        preload="metadata"
        src={asset.url}
        className="aspect-video w-full rounded bg-black/45 object-contain"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <VariantImage
      asset={asset}
      purpose="list"
      alt=""
      loading="lazy"
      className="aspect-video w-full rounded bg-black/45 object-contain"
    />
  );
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
  const tc = useCanvasTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const [category, setCategory] = useState<MediaAssetCategory>("uploads");
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
      ? assets.filter((asset) =>
          `${asset.id} ${asset.mimeType} ${asset.origin}`
            .toLowerCase()
            .includes(query),
        )
      : assets;
  }, [assets, search]);

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      {controlledOpen === undefined ? (
        <button
          type="button"
          ref={triggerRef}
          className="node-banana-input-assets nodrag nopan absolute left-2 top-2 z-20 flex h-8 items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900/90 px-2 text-xs text-neutral-200 disabled:opacity-45"
          disabled={!writable}
          aria-label={selectedAssetId ? tc("Replace asset") : tc("Assets")}
          onClick={() => setOpen(true)}
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          {selectedAssetId ? tc("Replace") : tc("Assets")}
        </button>
      ) : null}
      <AppDialog open={open} onOpenChange={close}>
        <AppDialogContent
          showCloseButton={false}
          size="md"
          surface="editor"
          padding="none"
          className="z-[10001] flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden"
          aria-label={tc("Assets")}
          data-node-banana-component="HistoryAssetDialog"
        >
          <AppDialogHeader className="flex-row items-center border-b border-neutral-700 px-4 py-3">
            <div>
              <AppDialogTitle className="m-0 text-sm">
                {tc("Assets")}
              </AppDialogTitle>
              <AppDialogDescription className="mt-0.5 text-xs text-neutral-500">
                {tc("Choose a")}{" "}
                {tc(mediaType[0].toUpperCase() + mediaType.slice(1))}{" "}
                {tc("asset")}
              </AppDialogDescription>
            </div>
            <AppDialogClose asChild>
              <AppDialogIconButton
                type="button"
                aria-label={tc("Close assets")}
                className="ml-auto border-0 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </AppDialogIconButton>
            </AppDialogClose>
          </AppDialogHeader>
          <Tabs
            value={category}
            onValueChange={(value) => {
              setCategory(value as MediaAssetCategory);
              setSearch("");
            }}
            data-horizontal=""
            className="min-h-0 flex-1 flex flex-col"
          >
            <TabsList
              activateOnFocus
              aria-label={tc("Asset source")}
              className="mx-4 mt-3 shrink-0"
            >
              {categories.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {tc(value[0].toUpperCase() + value.slice(1))}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="border-b border-neutral-700 p-3">
              <label className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <AppInput
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={tc("Search loaded assets...")}
                  className="h-9 w-full pl-9 text-sm"
                />
              </label>
            </div>
            <TabsContent
              value={category}
              tabIndex={0}
              aria-busy={assetsQuery.isFetching}
              className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3"
            >
              {assetsQuery.isError ? (
                <div className="col-span-full text-center text-xs text-neutral-400">
                  <p role="alert">
                    {tc("Could not load assets. Please try again.")}
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded border border-neutral-600 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={assetsQuery.isFetching}
                    onClick={() => void assetsQuery.refetch()}
                  >
                    {assetsQuery.isFetching ? tc("Retrying...") : tc("Retry")}
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
                    asset.id === selectedAssetId
                      ? "border-primary/60 bg-primary/5"
                      : "border-neutral-700 bg-neutral-900/35",
                  )}
                  disabled={!writable}
                  onClick={() => {
                    if (writable) {
                      onSelect(asset.id);
                      if (controlledOpen === undefined) close(false);
                    }
                  }}
                >
                  <AssetPreview asset={asset} />
                  <span className="mt-1.5 block truncate text-[10px] text-neutral-400">
                    {asset.mimeType}
                  </span>
                </button>
              ))}
              {assetsQuery.isLoading ? (
                <p
                  role="status"
                  className="col-span-full py-8 text-center text-xs text-neutral-400"
                >
                  {tc("Loading...")}
                </p>
              ) : null}
              {!assetsQuery.isLoading &&
              !assetsQuery.isError &&
              visibleAssets.length === 0 ? (
                <p className="col-span-full py-8 text-center text-xs text-neutral-400">
                  {tc("No assets in this category.")}
                </p>
              ) : null}
            </TabsContent>
            {assetsQuery.hasNextPage ? (
              <footer className="border-t border-neutral-700 p-3 text-right">
                <button
                  type="button"
                  className="rounded border border-neutral-600 px-3 py-1.5 text-xs hover:bg-neutral-700"
                  disabled={assetsQuery.isFetching}
                  onClick={() => void assetsQuery.fetchNextPage()}
                >
                  {tc("Load more")}
                </button>
              </footer>
            ) : null}
          </Tabs>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
