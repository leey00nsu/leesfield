"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FolderOpen, Upload, Loader2, Settings2, Grid2X2, Image as ImageIcon, Video, AudioLines } from "lucide-react";
import type { MediaAssetCategory, MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import { isFileDrag } from "@/shared/media-assets/media-file-drop";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import { cn } from "@/shared/lib/utils";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { AppButton } from "@/shared/ui/app-button";
import { AppFilterGroup, AppFilterToggle, AppFilterSection, AppFilterToolbar, AppSearchField, AppSortSelect } from "@/shared/ui/app-filter-toolbar";
import { AppMediaGalleryLoading, AppMediaGallery, AppMediaGalleryEmpty, appMediaGalleryTileClassName } from "@/shared/ui/app-media-gallery";
import { AppDatePicker } from "@/shared/ui/app-calendar";
import { AppMediaFitControl, useMediaPreviewFit } from "@/shared/ui/app-media-fit-control";
import { useMediaAssets, useAssetProjects, useAssetModelOptions } from "@/features/media-assets/hook/use-media-assets";
import { useAssetLibraryUploads } from "@/features/media-assets/hook/use-asset-library-uploads";
import { ManagedMediaAssetCard } from "@/features/media-assets/ui/managed-media-asset-card";
import { MediaAssetDetail } from "@/features/media-assets/ui/media-asset-detail";
import { AssetProjectSidebar } from "@/features/media-assets/ui/asset-project-sidebar";
import { AssetProjectSettings } from "@/features/media-assets/ui/asset-project-settings";
import { AssetProjectSelect } from "@/features/media-assets/ui/asset-project-filters";
import { assetErrorKey } from "@/features/media-assets/lib/asset-ui";
import type { AssetListFilters } from "@/features/media-assets/api/media-asset-api";

export function MediaLibraryScreen() {
  const tListControls = useTranslations("common.listControls");
  const t = useTranslations("assets");
  const [fit, setFit] = useMediaPreviewFit();
  const [type, setType] = useState<MediaType | undefined>();
  const [category, setCategory] = useState<MediaAssetCategory | undefined>();
  const [filters, setFilters] = useState<AssetListFilters>({ sort: "latest" });
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 250);
  const library = useMediaAssets(type, true, category, { ...filters, query });
  const projects = useAssetProjects();
  const modelOptions = useAssetModelOptions();
  const uploads = useAssetLibraryUploads();
  const input = useRef<HTMLInputElement>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<MediaAssetDto | null>(null);
  const [settings, setSettings] = useState<{ project: AssetProjectDto | null; parentId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null), [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const activeProject = projects.data?.find(project => project.id === filters.projectId);
  const allAssets = useMemo(() => [...new Map(library.data?.pages.flatMap(page => page.items).map(asset => [asset.id, asset]) ?? []).values()], [library.data]);
  const assets = allAssets.filter(asset => !uploads.uploads.some(upload => upload.asset?.id === asset.id));
  const { hasNextPage, isFetching, isError, fetchNextPage } = library;
  useEffect(() => {
    if (!sentinel || !hasNextPage || isFetching || isError || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(entries => { if (!requested && entries[0]?.isIntersecting) { requested = true; void fetchNextPage({ cancelRefetch: false }); } }, { rootMargin: "250px" });
    observer.observe(sentinel); return () => observer.disconnect();
  }, [sentinel, hasNextPage, isFetching, isError, fetchNextPage, assets.length]);
  function addFiles(files: readonly File[]) {
    const rejected = uploads.add(files, filters.projectId && filters.projectId !== "root" ? filters.projectId : null);
    setError(rejected ? t("unsupported") : null);
  }
  function setDate(key: "dateFrom" | "dateTo", date: Date) {
    const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (key === "dateTo" ? 1 : 0)).toISOString();
    setFilters(previous => {
      const next = { ...previous, [key]: boundary };
      if (next.dateFrom && next.dateTo && next.dateFrom >= next.dateTo) delete next[key === "dateFrom" ? "dateTo" : "dateFrom"];
      return next;
    });
  }
  const formatFilterDate = (iso: string, end = false) => {
    const date = new Date(new Date(iso).getTime() - (end ? 1 : 0));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  };
  const cardError = (err: unknown) => setError(t(assetErrorKey(err)));
  return <AppPageShell className="relative min-w-0 max-w-[1600px] gap-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
    <h1 className="sr-only">{t("title")}</h1>
    <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" tabIndex={-1} aria-label={t("upload")} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <AssetProjectSidebar projects={projects.data ?? []} filters={filters} loading={projects.isLoading} error={projects.isError} onRetry={() => void projects.refetch()}
      onSelect={(projectId, starred) => setFilters(previous => ({ ...previous, projectId, starred }))}
      onNew={() => setSettings({ project: null, parentId: activeProject?.id ?? null })} onSettings={project => setSettings({ project, parentId: project.parentId })} />
    <section aria-label={t("title")} className="relative flex w-full min-w-0 flex-col gap-6" onDragEnter={event => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); dragDepth.current++; setDragging(true); } }} onDragLeave={event => { if (isFileDrag(event.dataTransfer) && --dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDragOver={event => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => { if (!isFileDrag(event.dataTransfer)) return; event.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
      {dragging && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/85"><span className="text-sm">{t("upload")}</span></div>}
      {activeProject && <header className="flex min-w-0 items-center gap-4">
        {activeProject?.cover && <VariantImage asset={activeProject.cover} purpose="list" alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold">{activeProject.name}</h2>{activeProject?.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{activeProject.description}</p>}</div>
        {activeProject && <AppButton size="icon-sm" variant="surface" aria-label={t("projectSettings")} onClick={() => setSettings({ project: activeProject, parentId: activeProject.parentId })}><Settings2 className="size-4" /></AppButton>}
      </header>}
      <AppFilterToolbar
        filters={
          <>
            <AppFilterSection label={tListControls("type")}>
              <AppFilterGroup>
                <AppFilterToggle
                  active={!type}
                  aria-pressed={!type}
                  icon={<Grid2X2 className="size-4" />}
                  onClick={() => setType(undefined)}
                >
                  {t("all")}
                </AppFilterToggle>
                {(
                  [
                    { value: "image", icon: ImageIcon },
                    { value: "video", icon: Video },
                    { value: "audio", icon: AudioLines },
                  ] as const
                ).map(({ value, icon: Icon }) => (
                  <AppFilterToggle
                    key={value}
                    active={type === value}
                    aria-pressed={type === value}
                    icon={<Icon className="size-4" />}
                    onClick={() => setType(value)}
                  >
                    {t(value)}
                  </AppFilterToggle>
                ))}
              </AppFilterGroup>
            </AppFilterSection>
            <AppFilterSection label={tListControls("source")}>
              <AssetProjectSelect
                label={t("sourceFilter")}
                value={category ?? "all"}
                onChange={(value) =>
                  setCategory(
                    value === "all" ? undefined : (value as MediaAssetCategory),
                  )
                }
                options={[
                  { value: "all", label: t("sourceFilter") },
                  ...(["uploads", "generated", "edited"] as const).map((value) => ({
                    value,
                    label: t(value),
                  })),
                ]}
              />
            </AppFilterSection>
            <AppFilterSection label={t("classification")}>
              <AssetProjectSelect label={t("classification")} value={filters.classification ?? "all"}
                onChange={value => setFilters(previous => ({ ...previous, classification: value === "all" ? undefined : value as AssetListFilters["classification"] }))}
                options={[{ value: "all", label: t("all") }, ...(["none", "character", "location", "prop"] as const).map(value => ({ value, label: t("classifications." + value) }))]} />
            </AppFilterSection>
            <AppFilterSection label={t("managementStatus")}>
              <AssetProjectSelect label={t("managementStatus")} value={filters.managementStatus ?? "all"}
                onChange={value => setFilters(previous => ({ ...previous, managementStatus: value === "all" ? undefined : value as AssetListFilters["managementStatus"] }))}
                options={[{ value: "all", label: t("all") }, ...(["none", "draft", "active", "archived"] as const).map(value => ({ value, label: t("managementStatuses." + value) }))]} />
            </AppFilterSection>
            <AppFilterSection label={t("dateFilter")}>
              <AppDatePicker aria-label={t("dateFrom")} value={filters.dateFrom ? new Date(filters.dateFrom) : undefined} onChange={date => setDate("dateFrom", date)} />
              <AppDatePicker aria-label={t("dateTo")} value={filters.dateTo ? new Date(new Date(filters.dateTo).getTime() - 1) : undefined} onChange={date => setDate("dateTo", date)} />
            </AppFilterSection>
            <AppFilterSection label={t("modelFilter")}>
              <AssetProjectSelect label={t("modelFilter")} value={filters.model ?? "all"}
                disabled={modelOptions.isLoading}
                onChange={model => setFilters(previous => ({ ...previous, model: model === "all" ? undefined : model }))}
                options={[{ value: "all", label: t("allModels") }, ...[...new Set([...(modelOptions.data?.models ?? []), ...(filters.model ? [filters.model] : [])])].map(model => ({ value: model, label: model }))]} />
              {modelOptions.isError && <><p role="alert" className="text-xs text-destructive">{t("modelOptionsError")}</p><AppButton size="sm" variant="surface" onClick={() => void modelOptions.refetch()}>{t("retryModels")}</AppButton></>}
            </AppFilterSection>
            <AppFilterSection label={tListControls("sort")}>
              <AppSortSelect
                ariaLabel={t("sort")}
                className="sm:w-48 sm:flex-none"
                value={filters.sort ?? "latest"}
                onValueChange={(sort) =>
                  setFilters((previous) => ({
                    ...previous,
                    sort: sort as AssetListFilters["sort"],
                  }))
                }
                options={[
                  { value: "latest", label: t("latest") },
                  { value: "oldest", label: t("oldest") },
                  { value: "name", label: t("nameSort") },
                ]}
              />
            </AppFilterSection>
          </>
        }
        search={
          <AppSearchField
            autoFocus
            containerClassName="sm:min-w-48 sm:flex-1"
            value={search}
            onClear={() => setSearch("")}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        }
        filterCount={
          Number(Boolean(type)) +
          Number(Boolean(category)) +
          Number(filters.sort !== "latest") +
          Number(Boolean(filters.classification)) + Number(Boolean(filters.managementStatus)) +
          Number(Boolean(filters.dateFrom || filters.dateTo)) + Number(Boolean(filters.model))
        }
        searchActive={Boolean(search.trim())}
        filterChips={[
          ...(filters.classification ? [{ label: t("classifications." + filters.classification), onRemove: () => setFilters(previous => ({ ...previous, classification: undefined })) }] : []),
          ...(filters.managementStatus ? [{ label: t("managementStatuses." + filters.managementStatus), onRemove: () => setFilters(previous => ({ ...previous, managementStatus: undefined })) }] : []),
          ...(filters.dateFrom || filters.dateTo ? [{ label: [filters.dateFrom ? formatFilterDate(filters.dateFrom) : "…", filters.dateTo ? formatFilterDate(filters.dateTo, true) : "…"].join(" – "), onRemove: () => setFilters(previous => ({ ...previous, dateFrom: undefined, dateTo: undefined })) }] : []),
          ...(filters.model ? [{ label: filters.model, onRemove: () => setFilters(previous => ({ ...previous, model: undefined })) }] : []),
          ...(type ? [{label: t(type), onRemove: () => setType(undefined)}] : []), ...(category ? [{label: t(category), onRemove: () => setCategory(undefined)}] : []), ...(filters.sort !== "latest" ? [{label: t(filters.sort === "name" ? "nameSort" : "oldest"), onRemove: () => setFilters(previous => ({...previous, sort: "latest"}))}] : [])]}
        onResetFilters={() => {
          setType(undefined);
          setCategory(undefined);
          setFilters(previous => ({ projectId: previous.projectId, starred: previous.starred, sort: "latest" }));
        }}
      >
        <AppMediaFitControl value={fit} onChange={setFit} />
        <AppButton variant="brand" onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {t("upload")}
        </AppButton>
      </AppFilterToolbar>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(assets.length > 0 || uploads.uploads.length > 0) && <AppMediaGallery data-testid="asset-library-gallery">
        {uploads.uploads.map((upload) => upload.asset ? <div key={upload.id} className={cn("relative", appMediaGalleryTileClassName)}><ManagedMediaAssetCard presentation="gallery" fit={fit} className="h-full" asset={upload.asset} onSelect={() => setDetail(upload.asset!)} onError={cardError} />{upload.placementFailed && <div className="absolute inset-x-0 bottom-0 bg-black/90 p-2"><p role="alert" className="mt-2 text-xs text-destructive">{t("placementFailed")}</p><AppButton size="sm" variant="ghost" onClick={() => uploads.remove(upload.id)}>{t("remove")}</AppButton></div>}</div> : <article key={upload.id} aria-label={upload.file.name} className={cn("flex flex-col overflow-hidden bg-card p-2", appMediaGalleryTileClassName)}>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black/30">{upload.status === "uploading" ? <Loader2 className="size-6 animate-spin motion-reduce:animate-none" /> : <Upload className="size-6 text-muted-foreground" />}</div>
          <p className="mt-2 truncate text-sm">{upload.file.name}</p><p role="status" className="mt-1 text-xs text-muted-foreground">{t(upload.status === "uploading" ? "uploading" : upload.status === "failed" ? "uploadFailed" : "uploadCancelled")}</p>
          <div className="mt-2 flex flex-wrap gap-1">{upload.status === "uploading" ? <AppButton size="sm" variant="ghost" onClick={() => uploads.cancel(upload.id)}>{t("cancel")}</AppButton> : <AppButton size="sm" variant="ghost" onClick={() => uploads.retry(upload.id)}>{t("retry")}</AppButton>}<AppButton size="sm" variant="ghost" onClick={() => uploads.remove(upload.id)}>{t("remove")}</AppButton></div>
        </article>)}
        {assets.map((asset) => <ManagedMediaAssetCard key={asset.id} presentation="gallery" fit={fit} className={appMediaGalleryTileClassName} asset={asset} onSelect={() => setDetail(asset)} onError={cardError} />)}
      </AppMediaGallery>}
      {library.isLoading && !assets.length && !uploads.uploads.length && <AppMediaGalleryLoading label={t("loading")} />}
      {library.isFetchingNextPage && <div role="status" aria-label={t("loading")} className="flex h-12 items-center justify-center"><Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" /></div>}
      {library.isError && <div className="py-8 text-center"><p role="alert" className="text-sm">{t("error")}</p><AppButton size="sm" variant="ghost" disabled={library.isFetching} onClick={() => void (library.isFetchNextPageError ? library.fetchNextPage({ cancelRefetch: false }) : library.refetch())}>{t("retry")}</AppButton></div>}
      {!library.isLoading && !library.isError && !assets.length && !uploads.uploads.length && <AppMediaGalleryEmpty icon={<FolderOpen />} title={t("emptyTitle")} description={query ? t("noSearchResults") : t("empty")}><AppButton size="sm" variant="brand" onClick={() => input.current?.click()}>{t("upload")}</AppButton></AppMediaGalleryEmpty>}
      <div ref={setSentinel} className="h-px" aria-hidden="true" />
    </section>
    {settings && <AssetProjectSettings key={settings.project?.id ?? "new"} {...settings} onClose={() => setSettings(null)} onSaved={saved => {
      if (saved) setFilters(previous => ({ ...previous, projectId: saved.id, starred: undefined }));
      else if (filters.projectId === settings.project?.id) setFilters(previous => ({ ...previous, projectId: undefined }));
    }} />}
    {detail && <MediaAssetDetail asset={detail} onClose={() => setDetail(null)} allowDelete />}
  </AppPageShell>;
}
