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

import { useEffect, useMemo, useState } from "react";
import { AudioLines, Search, X } from "lucide-react";

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

export function MediaAssetPicker({
  mediaType, selectedAssetId = null, selectedUrls = [], writable, onSelect, open, onOpenChange, canSelectAsset,
}: {
  mediaType?: MediaType; selectedAssetId?: string | null; selectedUrls?: readonly string[];
  writable: boolean; onSelect: (asset: MediaAssetDto) => void;
  open: boolean; onOpenChange: (open: boolean) => void;
  canSelectAsset?: (asset: MediaAssetDto) => boolean;
}) {
  const tc = useCanvasTranslation();
  const [chosenType, setChosenType] = useState<MediaType>("image");
  const activeMediaType = mediaType ?? chosenType;
  const [category, setCategory] = useState<MediaAssetCategory>("uploads");
  const categories = ["uploads", "generated", "edited"] as const;
  const [search, setSearch] = useState("");
  const assetsQuery = useMediaAssets(activeMediaType, open, category);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const { hasNextPage, isFetching, isError, fetchNextPage } = assetsQuery;
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

  useEffect(() => {
    const target = sentinel;
    const root = scrollRoot;
    if (!open || !root || !target || !hasNextPage || isFetching || isError || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    let disposed = false;
    const observer = new IntersectionObserver(entries => {
      if (disposed || requested || !entries[0]?.isIntersecting) return;
      requested = true;
      void fetchNextPage({ cancelRefetch: false });
    }, { root, rootMargin: "200px" });
    observer.observe(target);
    return () => { disposed = true; observer.disconnect(); };
  }, [open, hasNextPage, isFetching, isError, fetchNextPage, visibleAssets.length, category, activeMediaType, search, sentinel, scrollRoot]);

  const close = onOpenChange;
  return (
      <AppDialog open={open} onOpenChange={close}>
        <AppDialogContent
          showCloseButton={false}
          size="md"
          surface="editor"
          padding="none"
          className="z-[10001] flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden"
          aria-label={tc("Assets")}
          data-media-asset-picker=""
        >
          <AppDialogHeader className="flex-row items-center border-b border-neutral-700 px-4 py-3">
            <div>
              <AppDialogTitle className="m-0 text-sm">
                {tc("Assets")}
              </AppDialogTitle>
              <AppDialogDescription className="mt-0.5 text-xs text-neutral-500">
                {tc("Choose a")}{" "}
                {tc(activeMediaType[0].toUpperCase() + activeMediaType.slice(1))}{" "}
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
          {!mediaType && <Tabs value={chosenType} onValueChange={value => { setChosenType(value as MediaType); setSearch(""); scrollRoot?.scrollTo?.({ top: 0 }); }} className="mx-4 mt-3 shrink-0">
            <TabsList aria-label={tc("Media type")}>{(["image","video","audio"] as const).map(type => <TabsTrigger key={type} value={type}>{tc(type[0].toUpperCase() + type.slice(1))}</TabsTrigger>)}</TabsList>
          </Tabs>}
          <Tabs
            value={category}
            onValueChange={(value) => {
              setCategory(value as MediaAssetCategory);
              setSearch("");
              scrollRoot?.scrollTo?.({ top: 0 });
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
              ref={setScrollRoot}
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
                    onClick={() => void (assetsQuery.isFetchNextPageError ? assetsQuery.fetchNextPage({ cancelRefetch: false }) : assetsQuery.refetch())}
                  >
                    {assetsQuery.isFetching ? tc("Retrying...") : tc("Retry")}
                  </button>
                </div>
              ) : null}
              {visibleAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={asset.id}
                  title={asset.id}
                  aria-pressed={(asset.id === selectedAssetId || selectedUrls.includes(asset.url))}
                  className={cn(
                    "min-w-0 rounded-lg border p-2 text-left hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    (asset.id === selectedAssetId || selectedUrls.includes(asset.url))
                      ? "border-primary/60 bg-primary/5"
                      : "border-neutral-700 bg-neutral-900/35",
                  )}
                  disabled={!writable || asset.type !== activeMediaType || asset.status !== "completed" || (canSelectAsset && !canSelectAsset(asset))}
                  onClick={() => {
                    if (writable && asset.type === activeMediaType && asset.status === "completed" && (!canSelectAsset || canSelectAsset(asset))) {
                      onSelect(asset);
                    }
                  }}
                >
                  <AssetPreview asset={asset} />
                  <span className="mt-1.5 block truncate text-[10px] text-neutral-400">
                    {asset.id}
                  </span>
                </button>
              ))}
              {assetsQuery.isLoading || assetsQuery.isFetchingNextPage ? (
                <p
                  role="status"
                  className="col-span-full py-8 text-center text-xs text-neutral-400"
                >
                  {tc("Loading...")}
                </p>
              ) : null}
              {!assetsQuery.isLoading &&
              !assetsQuery.isFetchingNextPage &&
              !assetsQuery.isError &&
              visibleAssets.length === 0 ? (
                <p className="col-span-full py-8 text-center text-xs text-neutral-400">
                  {tc("No assets in this category.")}
                </p>
              ) : null}
              <div ref={setSentinel} className="col-span-full h-px" aria-hidden="true" />
            </TabsContent>
          </Tabs>
        </AppDialogContent>
      </AppDialog>
  );
}
