"use client";
import { AssistantHistoryDetail } from "./assistant-history-detail";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";

import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppPageShell } from "@/shared/ui/app-page-shell";

import { useCallback, useRef, useState } from "react";
import { AppMediaDetailDialog, AppMediaDetailBackdrop, useMediaDetailDialog } from "@/shared/ui/app-media-detail-dialog";
import { MediaAssetDetailPanel } from "@/features/media-assets/ui/media-asset-detail-panel";
import { GenerationAudioPreview, useGenerationDetailTabs } from "@/features/generation-history/lib/use-generation-detail-tabs";
import {
  Download,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Square,
  SquareCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryStatus,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { useGenerationHistoryList } from "@/features/generation-history/hook/use-generation-history-list";
import { AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppFilterGroup,
  AppFilterSection,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";
import { AppMediaFitControl, useMediaPreviewFit } from "@/shared/ui/app-media-fit-control";
import { appToast } from "@/shared/ui/app-toast";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";

type HistoryStatusFilter =
  "all" | Extract<GenerationHistoryStatus, "completed" | "failed">;

export function GenerationHistoryScreen({ historyLink }: { historyLink?: { id: string; type: "image" | "video" | "audio"; origin: "generation" | "edit" } }) {
  const tListControls = useTranslations("common.listControls");
  const tHistory = useTranslations("history");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const [type, setType] = useState<GenerationHistoryType>("all");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [sort, setSort] = useState<GenerationHistorySort>("date_desc");
  const catalog = useRuntimeModelCatalog();
  const [model, setModel] = useState("all");
  const [hidden, setHidden] = useState(false);
  const [fit, setFit] = useMediaPreviewFit();
  const [autoplay, setAutoplay] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [selectedItem, setSelectedItem] =
    useState<GenerationHistoryItem | null>(null);
  const [dismissedLink, setDismissedLink] = useState<string | null>(null);
  const linkedRecord = useQuery({
    queryKey: ["history", "linked-record", historyLink],
    enabled: !!historyLink,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ type: historyLink!.type, origin: historyLink!.origin, view: "item" });
      const response = await fetch(`/api/history/${encodeURIComponent(historyLink!.id)}?${params}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("HISTORY_NOT_FOUND");
      return (await response.json() as { item: GenerationHistoryItem }).item;
    },
  });
  const activeItem = selectedItem ?? (dismissedLink !== historyLink?.id ? linkedRecord.data : null);
  const debouncedQuery = useDebouncedValue(searchInput, 350);
  const query = debouncedQuery.trim();
  const { items, isLoading, isFetchingNextPage, hasNextPage, error, sentinelRef, removeItem, retry } =
    useGenerationHistoryList({
      type,
      sort,
      query: "",
      prompt: query,
      model: model === "all" ? undefined : model,
      status: statusFilter,
      hidden,
    });

  const displayItems = items.map((item) => ({ ...item, hidden }));
  const hasFilteredState = query.length > 0 || model !== "all" || statusFilter !== "all" || hidden;

  return (
    <AppPageShell className="relative flex flex-col gap-6">
      <h1 className="sr-only">{tHistory("title.leading") + " " + tHistory("title.accent")}</h1>
      <section className="flex w-full flex-col gap-6">
        <AppFilterToolbar
          filters={
            <>
              <AppFilterSection label={tListControls("type")}>
                <AppSortSelect value={type} onValueChange={value=>{setType(value as GenerationHistoryType);setModel("all");}} ariaLabel={tListControls("type")} className="w-full" options={["all","image","video","audio","assistant"].map(value=>({value,label:value==="all"?tCommonLabels("all"):tHistory("types."+value)}))}/>
              </AppFilterSection>
              <AppFilterSection label={tListControls("status")}><AppFilterGroup>
                <AppFilterToggle active={statusFilter === "all"} aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>{tCommonLabels("all")}</AppFilterToggle>
                  <AppFilterToggle
                    onClick={() => setStatusFilter("completed")}
                    aria-pressed={statusFilter === "completed"}
                    active={statusFilter === "completed"}
                  >
                    {tHistory("statuses.completed")}
                  </AppFilterToggle>
                  <AppFilterToggle
                    onClick={() => setStatusFilter("failed")}
                    aria-pressed={statusFilter === "failed"}
                    active={statusFilter === "failed"}
                  >
                    {tHistory("statuses.failed")}
                  </AppFilterToggle>
</AppFilterGroup></AppFilterSection>
              <AppFilterSection label={tListControls("records")}><AppFilterGroup>
                  <AppFilterToggle
                    role="checkbox"
                    aria-checked={hidden}
                    active={hidden}
                    onClick={() => {
                      setHidden((value) => !value);
                      setSelectedItem(null);
                    }}
                  >
                    {tHistory("visibility.hidden")}
                  </AppFilterToggle>
</AppFilterGroup></AppFilterSection>
              {(type === "all" || type === "video") && <AppFilterSection label={tListControls("view")}><AppFilterGroup>
                  {(type === "all" || type === "video") && (
                    <AppFilterToggle
                      role="checkbox"
                      aria-checked={autoplay}
                      active={autoplay}
                      onClick={() => setAutoplay((value) => !value)}
                      icon={
                        autoplay ? (
                          <SquareCheck className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )
                      }
                    >
                      {tHistory("filters.autoplay")}
                    </AppFilterToggle>
                  )}
                </AppFilterGroup>
              </AppFilterSection>}
              <div
                data-testid="history-filter-trailing-controls"
                className="grid min-w-0 gap-3"
              >
                <AppFilterSection label={tHistory("filters.model")}>
                  <AppSelectRoot
                    value={model}
                    onValueChange={(value) => setModel(value ?? "all")}
                  >
                    <AppSelectTrigger
                      aria-label={tHistory("filters.model")}
                      className="data-[size=default]:h-10 w-full"
                    >
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      <AppSelectItem value="all">
                        {tHistory("filters.allModels")}
                      </AppSelectItem>
                      {catalog.items.filter(item=>type==="all"||item.type===(type==="assistant"?"llm":type)).map((item) => (
                        <AppSelectItem key={item.key} value={item.key}>
                          {item.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelectRoot>
                </AppFilterSection>
                <AppFilterSection label={tListControls("sort")}>
                  <AppSortSelect
                    value={sort}
                    onValueChange={(value) => setSort(value as GenerationHistorySort)}
                    ariaLabel={tHistory("filters.sort")}
                    className="w-full"
                    options={[
                      { value: "date_desc", label: tCommonLabels("dateDesc") },
                      { value: "date_asc", label: tCommonLabels("dateAsc") },
                    ]}
                  />
                </AppFilterSection>
              </div>
            </>
          }
          search={
            <AppSearchField
              autoFocus
              value={searchInput}
              onClear={() => setSearchInput("")}
            onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tHistory("filters.promptPlaceholder")}
              aria-label={tHistory("filters.prompt")}
              containerClassName="sm:flex-1"
            />
          }
          searchActive={Boolean(searchInput.trim())}
          filterChips={[...(type !== "all" ? [{label: tHistory("types." + type), onRemove: () => setType("all")}] : []), ...(statusFilter !== "all" ? [{label: tHistory("statuses." + statusFilter), onRemove: () => setStatusFilter("all")}] : []), ...(model !== "all" ? [{label: catalog.items.find(item => item.key === model)?.label ?? model, onRemove: () => setModel("all")}] : []), ...(hidden ? [{label: tHistory("visibility.hidden"), onRemove: () => setHidden(false)}] : []), ...(sort !== "date_desc" ? [{label: tCommonLabels("dateAsc"), onRemove: () => setSort("date_desc")}] : [])]}
          filterCount={
            Number(type !== "all") +
            Number(statusFilter !== "all") +
            Number(model !== "all") +
            Number(hidden) +
            Number(sort !== "date_desc")
          }
          onResetFilters={() => {
            setType("all");
            setStatusFilter("all");
            setModel("all");
            setHidden(false);
            setSort("date_desc");
            setSelectedItem(null);
          }}
        ><AppMediaFitControl value={fit} onChange={setFit} /></AppFilterToolbar>
      </section>

      <div className="w-full">
        {error && items.length === 0 ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tHistory("error")}
            <AppButton onClick={() => void retry()} variant="surface">{tCommonActions("retry")}</AppButton>
          </div>
        ) : (
          <HistoryList autoplay={autoplay} fit={fit}
            items={displayItems}
            isLoading={isLoading && items.length === 0}
            onDeleteItem={removeItem}
            onSelectItem={setSelectedItem}
            emptyMessage={
              hasFilteredState
                ? tHistory("empty.search")
                : tHistory("empty.default")
            }
          />
        )}
        {items.length > 0 && (hasNextPage || error) && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div
              ref={sentinelRef}
              data-testid="history-infinite-sentinel"
              aria-hidden="true"
              className="h-8 w-full max-w-xs"
            />
            {error && <AppButton variant="surface" onClick={() => void retry()}>{tCommonActions("retry")}</AppButton>}
            {isFetchingNextPage && (
              <div role="status" aria-label={tCommonActions("loading")} className="flex h-12 items-center justify-center">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
              </div>
            )}
          </div>
        )}
      </div>
      {activeItem ? (
        <HistoryDetailOverlay
          item={activeItem}
          onClose={() => { setSelectedItem(null); setDismissedLink(historyLink?.id ?? null); }}
          onDeleted={async (item) => { await removeItem(item); setSelectedItem(null); setDismissedLink(historyLink?.id ?? null); }}
        />
      ) : null}
    </AppPageShell>
  );
}

function HistoryDetailOverlay(props:{item:GenerationHistoryItem;onClose:()=>void;onDeleted:(item:GenerationHistoryItem)=>void|Promise<void>}) {return props.item.type==="assistant"?<AssistantHistoryDetail item={props.item} onClose={props.onClose}/>:<MediaHistoryDetailOverlay {...props}/>;}

function MediaHistoryDetailOverlay({
  item,
  onClose,
  onDeleted,
}: {
  item: GenerationHistoryItem;
  onClose: () => void;
  onDeleted: (item: GenerationHistoryItem) => void | Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteRef = useRef(false);
  const modalBusyRef = useRef(false);

  const tHistory = useTranslations("history");
  const tActions = useTranslations("history.detailActions");
  const tCommonActions = useTranslations("common.actions");
  const { item: hydratedItem, detailQuery, previewUrl, tabs } = useGenerationDetailTabs(item);
  const historyEndpoint = "/api/history/" + encodeURIComponent(item.id) + "?" + new URLSearchParams({type: item.type, origin: item.origin ?? "generation"});
  const [assetSaving, setAssetSaving] = useState(false);
  modalBusyRef.current = confirmDelete || deleting || assetSaving;
  const guard = useMediaDetailDialog(onClose, confirmDelete || deleting || assetSaving);
  const onAssetBusy = useCallback((busy: boolean) => {setAssetSaving(busy); modalBusyRef.current = busy || confirmDelete || deleting;}, [confirmDelete, deleting]);
  const handleDelete = async () => {
    if (deleteRef.current) return;
    deleteRef.current = true;
    setDeleting(true);
    try {
      const response = await fetch("/api/history/" + encodeURIComponent(item.id) + "/visibility", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: item.type, origin: item.origin ?? "generation", hidden: !item.hidden }) });
      if (!response.ok) throw new Error("DELETE_FAILED");
      appToast.success(tHistory(item.hidden ? "visibility.restoreSuccess" : "visibility.hideSuccess"));
      setConfirmDelete(false);
      await onDeleted(item);
    } catch { appToast.error(tHistory("visibility.error")); }
    finally {deleteRef.current = false; setDeleting(false);}
  };

  return (
    <AppMediaDetailDialog controller={guard}
      className="grid h-dvh grid-rows-[minmax(100px,22dvh)_minmax(0,1fr)] gap-0 overflow-hidden lg:grid-cols-[1fr_25rem] lg:grid-rows-[minmax(0,1fr)]">
      <AppDialogTitle className="sr-only">{tHistory("detail.title")}</AppDialogTitle>
      <AppMediaDetailBackdrop
        data-testid="history-detail-preview-backdrop"
        role="presentation"
        className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[#050606] p-6"
      >
        {previewUrl ? (
          hydratedItem.type === "video" ? (
            <div data-app-media-detail-content="" className="contents"><AppVideoPlayer
              data-testid="history-detail-preview-media"
              src={previewUrl}
              controls
              className="max-h-[18dvh] lg:max-h-[86vh] max-w-full rounded-2xl object-contain"
            /></div>
          ) : hydratedItem.type === "audio" ? (
            <div
              data-testid="history-detail-preview-media"
              data-app-media-detail-content=""
              role="presentation"
              className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-8"
            >
              <GenerationAudioPreview src={previewUrl} assetId={hydratedItem.assetId} controls className="w-full" />
            </div>
          ) : (
            <VariantImage
              data-testid="history-detail-preview-media"
              data-app-media-detail-content=""
              asset={{url: previewUrl, imageVariants: hydratedItem.imageVariants}}
              alt={tHistory("previewAlt")}
              className="max-h-[18dvh] lg:max-h-[86vh] max-w-full rounded-2xl object-contain shadow-[0_24px_120px_rgba(0,0,0,0.55)]"
            />
          )
        ) : (
          <div
            data-testid="history-detail-preview-media"
            data-app-media-detail-content=""
            role="presentation"
            className="flex h-80 w-full max-w-xl items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
          >
            <ImageIcon className="h-12 w-12 text-gray-500" />
          </div>
        )}
      </AppMediaDetailBackdrop>

      <MediaAssetDetailPanel assetId={hydratedItem.assetId ?? null} onClose={() => { if (!modalBusyRef.current) guard.requestClose(); }}
        busy={deleting} onBusyChange={onAssetBusy} onDirtyChange={guard.setDirty}
        notice={hydratedItem.status === "failed" ? <div role="alert" className="max-h-[35%] shrink-0 overflow-y-auto rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><strong>{tHistory("statuses.failed")}</strong><p className="mt-1 break-words">{hydratedItem.errorMessage || tHistory("detail.failureFallback")}</p></div> : undefined} tabs={tabs} testId="history-detail-rail"
        actions={<>
          {detailQuery.isError && <AppButton type="button" variant="surface" className="col-span-2" onClick={() => void detailQuery.refetch()}>{tCommonActions("retry")}</AppButton>}
          {hydratedItem.status === "completed" && hydratedItem.resultUrl ? <AppButton asChild variant="surface" className="col-span-2 h-11 rounded-xl"><a href={historyEndpoint} download aria-label={tActions("download")}><Download className="size-4" />{tActions("download")}</a></AppButton> : <AppButton disabled variant="surface" className="col-span-2 h-11 rounded-xl" aria-label={tActions("download")}><Download className="size-4" />{tActions("download")}</AppButton>}
          <AppButton type="button" variant="surface" disabled={deleting || assetSaving || ["pending", "processing", "uploading"].includes(hydratedItem.status)} onClick={() => setConfirmDelete(true)} className="col-span-2 h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" />{tHistory(item.hidden ? "visibility.restore" : "visibility.hide")}</AppButton>
        </>} />
      <AppConfirmDialog open={confirmDelete} onOpenChange={(open) => {if (!deleting) setConfirmDelete(open);}}>
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader><AppConfirmDialogTitle>{tHistory(item.hidden ? "visibility.restore" : "visibility.hide")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{tHistory("visibility.description")}</AppConfirmDialogDescription></AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel disabled={deleting}>{tCommonActions("cancel")}</AppConfirmDialogCancel>
            <AppConfirmDialogAction variant="danger" disabled={deleting} onClick={(event) => {event.preventDefault(); void handleDelete();}}>{deleting && <Loader2 className="h-4 w-4 animate-spin" />}{tHistory(item.hidden ? "visibility.restore" : "visibility.hide")}</AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>
    </AppMediaDetailDialog>
  );
}
