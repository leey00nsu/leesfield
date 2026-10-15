"use client";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/brand/tabs/tabs";
import { AppButton } from "@/shared/ui/app-button";
import { AppFilterToolbar, AppSearchField } from "@/shared/ui/app-filter-toolbar";
import { AppResourceEmpty } from "@/shared/ui/app-resource-list";
import { AppMediaGallery, AppMediaGalleryLoading } from "@/shared/ui/app-media-gallery";
import { useTranslations } from "next-intl";
import { ManagedMediaAssetCard } from "./managed-media-asset-card";
import { AssetProjectFilters } from "./asset-project-filters";
import { MediaAssetDetail } from "./media-asset-detail";
import { assetErrorKey } from "../lib/asset-ui";
import type { AssetListFilters } from "../api/media-asset-api";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, X } from "lucide-react";

import { useMediaAssets, useAssetProjects } from "@/features/media-assets/hook/use-media-assets";
import type {
  MediaAssetCategory,
  MediaAssetDto,
  MediaType,
} from "@/shared/media-assets/media-asset-contract";

import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogIconButton,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";

export function MediaAssetPicker({
  mediaType, selectedAssetId = null, selectedUrls = [], writable, onSelect, open, onOpenChange, canSelectAsset, allowDetails = true, className,
}: {
  mediaType?: MediaType; selectedAssetId?: string | null; selectedUrls?: readonly string[];
  writable: boolean; onSelect: (asset: MediaAssetDto) => void;
  open: boolean; onOpenChange: (open: boolean) => void;
  canSelectAsset?: (asset: MediaAssetDto) => boolean;
  allowDetails?: boolean; className?: string;
}) {
  const tc = useCanvasTranslation();
  const t = useTranslations("assets");
  const projects = useAssetProjects(open);
  const [filters, setFilters] = useState<AssetListFilters>({sort:"latest"});
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<MediaAssetDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenType, setChosenType] = useState<MediaType>("image");
  const activeMediaType = mediaType ?? chosenType;
  const [category, setCategory] = useState<MediaAssetCategory | "all">("all");
  const categories = ["all", "uploads", "generated", "edited"] as const;
  const [search, setSearch] = useState("");
  const assetsQuery = useMediaAssets(activeMediaType, open, category === "all" ? undefined : category, { ...filters, query });
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const { hasNextPage, isFetching, isError, fetchNextPage } = assetsQuery;
  const assets = useMemo(
    () => assetsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [assetsQuery.data],
  );
  const visibleAssets = assets;
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);

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
      <>
      <AppDialog open={open} onOpenChange={close}>
        <AppDialogContent
          showCloseButton={false}
          size="xl"
          surface="editor"
          padding="none"
          className={"z-[10001] flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden " + (className ?? "")}
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
          {!mediaType && <Tabs data-horizontal="" value={chosenType} onValueChange={value => { setChosenType(value as MediaType); scrollRoot?.scrollTo?.({ top: 0 }); }} className="mx-4 mt-3 shrink-0">
            <TabsList aria-label={tc("Media type")}>{(["image","video","audio"] as const).map(type => <TabsTrigger key={type} value={type}>{tc(type[0].toUpperCase() + type.slice(1))}</TabsTrigger>)}</TabsList>
          </Tabs>}
          <Tabs
            value={category}
            onValueChange={(value) => {
              setCategory(value as MediaAssetCategory | "all");
              scrollRoot?.scrollTo?.({ top: 0 });
            }}
            data-horizontal=""
            className="min-h-0 flex-1 flex flex-col"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <TabsList
              activateOnFocus
              aria-label={tc("Asset source")}
              className="shrink-0 bg-background"
            >
              {categories.map((value) => (
                <TabsTrigger key={value} value={value} className="data-active:bg-data-accent/20 data-active:text-data-accent-foreground data-active:border-data-accent/40 dark:data-active:bg-data-accent/20 dark:data-active:text-data-accent-foreground dark:data-active:border-data-accent/40">
                  {value === "all" ? t("all") : tc(value[0].toUpperCase() + value.slice(1))}
                </TabsTrigger>
              ))}
            </TabsList>
            <AppFilterToolbar className="w-full sm:w-auto sm:flex-1"
              search={<AppSearchField autoFocus value={search} onClear={() => setSearch("")} onChange={event => setSearch(event.target.value)} aria-label={t("search")} placeholder={t("search")} />}
              searchActive={!!search.trim()}
              filterCount={Number(!!filters.projectId) + Number(!!filters.starred)}
              onResetFilters={() => setFilters({ sort: "latest" })}
              filters={<><AssetProjectFilters value={filters} onChange={setFilters} projects={projects.data} />{projects.isError && <p role="alert" className="text-xs text-destructive">{t("error")} <AppButton size="sm" variant="ghost" onClick={() => void projects.refetch()}>{t("retry")}</AppButton></p>}</>} />
            </div>
            {error && <p role="alert" className="px-3 text-xs text-destructive">{error}</p>}
            <TabsContent
              ref={setScrollRoot}
              value={category}
              tabIndex={0}
              aria-busy={assetsQuery.isFetching}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
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
              {assetsQuery.isLoading && !visibleAssets.length ? <AppMediaGalleryLoading label={tc("Loading...")} /> : <AppMediaGallery>
              {visibleAssets.map((asset) => (
                <ManagedMediaAssetCard key={asset.id} asset={asset}
                  presentation="gallery"
                  selected={asset.id === selectedAssetId || selectedUrls.includes(asset.url)}
                  disabled={!writable || asset.type !== activeMediaType || asset.status !== "completed" || (!!canSelectAsset && !canSelectAsset(asset))}
                  onSelect={() => { if (writable && asset.type === activeMediaType && asset.status === "completed" && (!canSelectAsset || canSelectAsset(asset))) onSelect(asset); }}
                  onDetails={allowDetails ? () => setDetail(asset) : undefined}
                  writable={writable} onError={err => setError(t(assetErrorKey(err)))} />
              ))}
              </AppMediaGallery>}
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
                <AppResourceEmpty icon={<FolderOpen />} description={search.trim() || filters.projectId || filters.starred ? t("noSearchResults") : tc("No assets in this category.")}>{(search.trim() || filters.projectId || filters.starred) && <AppButton type="button" size="sm" variant="surface" onClick={() => { setSearch(""); setQuery(""); setFilters({ sort: "latest" }); }}>{t("clearConditions")}</AppButton>}</AppResourceEmpty>
              ) : null}
              <div ref={setSentinel} className="col-span-full h-px" aria-hidden="true" />
            </TabsContent>
          </Tabs>
        </AppDialogContent>
      </AppDialog>
      {open && detail && <MediaAssetDetail asset={detail} onClose={() => setDetail(null)} writable={writable} />}
      </>
  );
}
