"use client";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";

import { HistoryRequestSettings } from "./history-request-settings";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppPageShell } from "@/shared/ui/app-page-shell";

import { useRef, useState } from "react";
import {
  AudioLines,
  Copy,
  Download,
  Trash2,
  Loader2,
  Grid2X2,
  Image as ImageIcon,
  RotateCcw,
  Square,
  SquareCheck,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryStatus,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { useGenerationHistoryList } from "@/features/generation-history/hook/use-generation-history-list";
import { useMonitoringRequestDetail } from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import type { MonitoringRequestDetail } from "@/features/monitoring-dashboard/model/types";
import { AppDetailRail, AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogClose } from "@/shared/ui/app-dialog";
import { AppCloseButton } from "@/shared/ui/app-close-button";
import { AppButton } from "@/shared/ui/app-button";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";
import {
  AppFilterGroup,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";
import { AppTabs } from "@/shared/ui/app-tabs";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";
import { appToast } from "@/shared/ui/app-toast";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import { formatDuration } from "@/features/monitoring-dashboard/lib/format";

type HistoryStatusFilter =
  "all" | Extract<GenerationHistoryStatus, "completed" | "failed">;
const FINISHED_STATUSES = new Set(["completed", "failed"]);
const HISTORY_STATUSES = new Set<GenerationHistoryStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
]);

function buildHistoryGenerationUrl(
  item: GenerationHistoryItem,
  target: "/image" | "/video" | "/audio",
  options: { includeImageReference?: boolean } = {},
) {
  const params = new URLSearchParams();
  const prompt = item.prompt.trim();
  if (prompt) params.set("prompt", prompt);
  const model = item.model?.trim();
  if (model) params.set("model", model);
  if (
    options.includeImageReference &&
    item.type === "image" &&
    item.resultUrl
  ) {
    params.set("initImage", item.resultUrl);
  }
  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

function formatFallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function formatProgress(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}%`
    : "-";
}

function toHistoryStatus(status: string): GenerationHistoryStatus | null {
  return HISTORY_STATUSES.has(status as GenerationHistoryStatus)
    ? (status as GenerationHistoryStatus)
    : null;
}

function hydrateHistoryItem(
  item: GenerationHistoryItem,
  detail: MonitoringRequestDetail | null | undefined,
): GenerationHistoryItem {
  if (!detail) return item;

  const resultUrl = detail.assets[0]?.url ?? item.resultUrl;
  return {
    ...item,
    id: detail.id,
    type: detail.type,
    status: toHistoryStatus(detail.status) ?? item.status,
    prompt: detail.prompt,
    model: detail.model,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    durationMs: detail.durationMs,
    progress: detail.progress,
    resultUrl,
    imageVariants: detail.assets[0]?.imageVariants ?? item.imageVariants,
    thumbnailUrl:
      detail.type === "image" ? resultUrl : (item.thumbnailUrl ?? resultUrl),
    inputImages: detail.inputImages,
    inputAudios: detail.inputAudios,
    referenceText: detail.referenceText,
    errorMessage: detail.errorMessage,
  };
}

export function GenerationHistoryScreen() {
  const router = useRouter();
  const tHistory = useTranslations("history");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const [type, setType] = useState<GenerationHistoryType>("all");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [sort, setSort] = useState<GenerationHistorySort>("date_desc");
  const catalog = useRuntimeModelCatalog();
  const [model, setModel] = useState("all");
  const [autoplay, setAutoplay] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [selectedItem, setSelectedItem] =
    useState<GenerationHistoryItem | null>(null);
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
    });

  const displayItems = items;
  const hasFilteredState = query.length > 0 || model !== "all" || statusFilter !== "all";

  return (
    <AppPageShell className="relative flex flex-col gap-6">
      <h1 className="sr-only">{tHistory("title.leading") + " " + tHistory("title.accent")}</h1>
      <section className="flex w-full flex-col gap-6">
        <AppFilterToolbar className="lg:flex-col lg:items-stretch">
          <AppFilterGroup>
            <AppFilterToggle
              onClick={() => {
                setType("all");
                setStatusFilter("all");
              }}
              aria-pressed={type === "all" && statusFilter === "all"}
              active={type === "all" && statusFilter === "all"}
              icon={<Grid2X2 className="h-4 w-4" />}
            >
              {tCommonLabels("all")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("image")}
              aria-pressed={type === "image"}
              active={type === "image"}
              icon={<ImageIcon className="h-4 w-4" />}
            >
              {tCommonLabels("images")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("video")}
              aria-pressed={type === "video"}
              active={type === "video"}
              icon={<Video className="h-4 w-4" />}
            >
              {tCommonLabels("videos")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("audio")}
              aria-pressed={type === "audio"}
              active={type === "audio"}
              icon={<AudioLines className="h-4 w-4" />}
            >
              {tCommonLabels("audios")}
            </AppFilterToggle>
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
            {(type === "all" || type === "video") && <AppFilterToggle role="checkbox" aria-checked={autoplay} active={autoplay} onClick={() => setAutoplay(value => !value)} icon={autoplay ? <SquareCheck className="h-4 w-4" /> : <Square className="h-4 w-4" />}>{tHistory("filters.autoplay")}</AppFilterToggle>}
          </AppFilterGroup>

          <div
            data-testid="history-filter-trailing-controls"
            className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          >
            <AppSelectRoot value={model} onValueChange={value => setModel(value ?? "all")}>
              <AppSelectTrigger aria-label={tHistory("filters.model")} className="h-14 w-full sm:w-64"><AppSelectValue /></AppSelectTrigger>
              <AppSelectContent><AppSelectItem value="all">{tHistory("filters.allModels")}</AppSelectItem>
                {catalog.items.map(item => <AppSelectItem key={item.key} value={item.key}>{item.label}</AppSelectItem>)}
              </AppSelectContent>
            </AppSelectRoot>
            <AppSearchField
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tHistory("filters.promptPlaceholder")}
              aria-label={tHistory("filters.prompt")}
              containerClassName="sm:flex-1"
            />
            <AppSortSelect
              value={sort}
              onValueChange={(value) => setSort(value as GenerationHistorySort)}
              ariaLabel={tHistory("filters.sort")}
              className="h-14 sm:w-[12rem] sm:flex-none"
              options={[
                { value: "date_desc", label: tCommonLabels("dateDesc") },
                { value: "date_asc", label: tCommonLabels("dateAsc") },
              ]}
            />
          </div>
        </AppFilterToolbar>
      </section>

      <div className="w-full">
        {error && items.length === 0 ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tHistory("error")}
            <AppButton onClick={() => void retry()} variant="surface">{tCommonActions("retry")}</AppButton>
          </div>
        ) : (
          <HistoryList autoplay={autoplay}
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
      {selectedItem ? (
        <HistoryDetailOverlay
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onRecreate={(item) => {
            const target =
              item.type === "video"
                ? "/video"
                : item.type === "audio"
                  ? "/audio"
                  : "/image";
            router.push(buildHistoryGenerationUrl(item, target));
          }}
          onCreateVideo={(item) =>
            router.push(
              buildHistoryGenerationUrl(item, "/video", {
                includeImageReference: true,
              }),
            )
          }
          onDeleted={async (item) => { await removeItem(item); setSelectedItem(null); }}
        />
      ) : null}
    </AppPageShell>
  );
}

function HistoryDetailOverlay({
  item,
  onClose,
  onRecreate,
  onCreateVideo,
  onDeleted,
}: {
  item: GenerationHistoryItem;
  onClose: () => void;
  onRecreate: (item: GenerationHistoryItem) => void;
  onCreateVideo: (item: GenerationHistoryItem) => void;
  onDeleted: (item: GenerationHistoryItem) => void | Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteRef = useRef(false);
  const modalBusyRef = useRef(false);
  modalBusyRef.current = confirmDelete || deleting;
  const locale = useLocale();
  const tHistory = useTranslations("history");
  const tActions = useTranslations("history.detailActions");
  const tCommonActions = useTranslations("common.actions");
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const detailQuery = useMonitoringRequestDetail(
    item.type,
    item.id,
    item.origin !== "edit",
  );
  const detail = detailQuery.data ?? null;
  const hydratedItem = hydrateHistoryItem(item, detail);
  const previewUrl = hydratedItem.resultUrl ?? hydratedItem.thumbnailUrl;
  const canUseImageReference =
    hydratedItem.type === "image" && Boolean(hydratedItem.resultUrl?.match(/^https?:\/\//));
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return dateFormatter.format(parsed);
  };
  const updatedAt = hydratedItem.updatedAt ?? null;
  const completedAt =
    updatedAt && FINISHED_STATUSES.has(hydratedItem.status)
      ? formatDateTime(updatedAt)
      : "-";
  const durationMs =
    typeof hydratedItem.durationMs === "number"
      ? hydratedItem.durationMs
      : updatedAt && FINISHED_STATUSES.has(hydratedItem.status)
        ? Math.max(
            0,
            new Date(updatedAt).getTime() -
              new Date(hydratedItem.createdAt).getTime(),
          )
        : null;
  const inputImages = hydratedItem.inputImages ?? [];
  const inputAudios = hydratedItem.inputAudios ?? [];
  const resultLabel =
    hydratedItem.type === "audio"
      ? tHistory("detail.resultAudio")
      : hydratedItem.type === "video"
        ? tHistory("detail.resultVideo")
        : tHistory("detail.resultImage");
  const inputLabel =
    hydratedItem.type === "audio"
      ? tHistory("detail.inputAudio")
      : tHistory("detail.inputImage");
  const formattedRequestedAt = formatDateTime(hydratedItem.createdAt);
  const formattedDuration = formatDuration(durationMs);
  const formattedProgress = formatProgress(hydratedItem.progress);
  const resultUrl = hydratedItem.resultUrl ?? null;
  const thumbnailUrl =
    hydratedItem.thumbnailUrl ?? hydratedItem.resultUrl ?? null;
  const warningMessage = detail?.warningMessage ?? null;

  const settingsRows = [
    {
      label: tHistory("detail.model"),
      value: formatFallback(hydratedItem.model),
    },
    { label: tHistory("detail.type"), value: tTypes(hydratedItem.type) },
    {
      label: tHistory("detail.origin"),
      value: tHistory(`origins.${hydratedItem.origin ?? "generation"}`),
    },
    { label: tHistory("detail.status"), value: tStatuses(hydratedItem.status) },
    { label: tHistory("detail.progress"), value: formattedProgress },
  ];
  const metadataRows = [
    { label: tHistory("detail.requestId"), value: hydratedItem.id },
    { label: tHistory("detail.requestedAt"), value: formattedRequestedAt },
    { label: tHistory("detail.completedAt"), value: completedAt },
    { label: tHistory("detail.duration"), value: formattedDuration },
    {
      label: tHistory("detail.assetId"),
      value: formatFallback(hydratedItem.assetId),
    },
    {
      label: tHistory("detail.graphId"),
      value: formatFallback(hydratedItem.graphId),
    },
    {
      label: tHistory("detail.graphNodeId"),
      value: formatFallback(hydratedItem.graphNodeId),
    },
    {
      label: tHistory("detail.sourceRecord"),
      value: hydratedItem.operation?.id ?? hydratedItem.id,
    },
    {
      label: tHistory("detail.sourceAssets"),
      value: hydratedItem.sourceAssetIds?.join(", ") || "-",
    },
  ];

  const primaryInputImage = inputImages[0] ?? null;
  const primaryInputAudio = inputAudios[0] ?? null;

  const renderMediaPreview = ({
    label,
    url,
    type,
    empty,
  }: {
    label: string;
    url: string | null;
    type: GenerationHistoryItem["type"];
    empty: string;
  }) => (
    <div className="rounded-xl border border-white/10 bg-black/18 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-gray-500">
        <span>{label}</span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold tracking-normal text-white/48 hover:text-primary"
          >
            {tHistory("detail.openAsset")}
          </a>
        ) : null}
      </div>
      {url ? (
        type === "audio" ? (
          <div className="flex min-h-24 items-center rounded-lg bg-black/45 p-3">
            <audio controls className="w-full" src={url} />
          </div>
        ) : type === "video" ? (
          <video
            controls
            className="h-36 w-full rounded-lg bg-black/45 object-contain"
            src={url}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            loading="lazy"
            className="h-36 w-full rounded-lg bg-black/45 object-contain"
          />
        )
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-white/36">
          {empty}
        </div>
      )}
    </div>
  );

  const historyEndpoint = "/api/history/" + encodeURIComponent(item.id) + "?" + new URLSearchParams({type: item.type, origin: item.origin ?? "generation"});
  const handleDelete = async () => {
    if (deleteRef.current) return;
    deleteRef.current = true;
    setDeleting(true);
    try {
      const response = await fetch(historyEndpoint, {method: "DELETE"});
      if (!response.ok) throw new Error("DELETE_FAILED");
      appToast.success(tHistory("toasts.deleteSuccess"));
      setConfirmDelete(false);
      await onDeleted(item);
    } catch { appToast.error(tHistory("toasts.deleteError")); }
    finally {deleteRef.current = false; setDeleting(false);}
  };

  const handleCopyPrompt = async () => {
    const copied = await copyTextToClipboard(hydratedItem.prompt);
    if (copied) {
      appToast.copied(tCommonActions("copied"));
    }
  };

  const renderRows = (rows: Array<{ label: string; value: string }>) => (
    <dl className="grid gap-3 text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3"
        >
          <dt className="text-white/42">{row.label}</dt>
          <dd className="min-w-0 break-words text-right font-semibold text-white">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );

  const promptTab = (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
          <span>{tHistory("detail.fullPrompt")}</span>
          <AppButton
            type="button"
            variant="surface"
            size="sm"
            onClick={handleCopyPrompt}
            className="h-8 rounded-lg px-2.5 text-xs"
          >
            <Copy className="h-3.5 w-3.5" />
            {tActions("copy")}
          </AppButton>
        </div>
        <AppExpandableText
          collapsedLines={4}
          showMoreLabel={tHistory("detail.showMore")}
          showLessLabel={tHistory("detail.showLess")}
          className="rounded-xl border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          bodyClassName="text-sm leading-6 text-white/68"
        >
          {hydratedItem.prompt}
        </AppExpandableText>
      </div>

      {hydratedItem.referenceText ? (
        <div className="grid gap-3">
          <div className="text-sm font-semibold text-white">
            {tHistory("detail.referenceText")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            bodyClassName="text-sm leading-6 text-white/68"
          >
            {hydratedItem.referenceText}
          </AppExpandableText>
        </div>
      ) : null}
    </div>
  );

  const settingsTab = (
    <AppDetailSection className="p-4">
      {renderRows(settingsRows)}
      <HistoryRequestSettings parameters={detail?.requestParameters} loading={detailQuery.isLoading} error={detailQuery.isError} />
    </AppDetailSection>
  );

  const metadataTab = (
    <AppDetailSection className="p-4">
      {renderRows(metadataRows)}
    </AppDetailSection>
  );

  const historyTab = (
    <div className="grid gap-3">
      {renderMediaPreview({
        label: inputLabel,
        url:
          hydratedItem.type === "audio" ? primaryInputAudio : primaryInputImage,
        type: hydratedItem.type === "audio" ? "audio" : "image",
        empty: tHistory("detail.noInputAsset"),
      })}
      {hydratedItem.errorMessage ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold text-red-100">
            {tHistory("detail.errorMessage")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-red-300/20 bg-red-500/10 p-4"
            bodyClassName="text-sm leading-6 text-red-50/80"
          >
            {hydratedItem.errorMessage}
          </AppExpandableText>
        </div>
      ) : null}
      {warningMessage ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold text-amber-100">
            {tHistory("detail.warningMessage")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4"
            bodyClassName="text-sm leading-6 text-amber-50/80"
          >
            {warningMessage}
          </AppExpandableText>
        </div>
      ) : null}
      {hydratedItem.operation ? (
        <div className="grid gap-2 rounded-xl border border-white/10 bg-black/18 p-4">
          <div className="text-sm font-semibold text-white">
            {tHistory("detail.operationParameters")}
          </div>
          <p className="text-xs text-white/55">
            {hydratedItem.operation.type} · v
            {hydratedItem.operation.configVersion}
          </p>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-white/58">
            {JSON.stringify(hydratedItem.operation.parameters, null, 2)}
          </pre>
        </div>
      ) : null}
      {renderMediaPreview({
        label: resultLabel,
        url: thumbnailUrl ?? resultUrl,
        type: hydratedItem.type,
        empty: tHistory("detail.noResultAsset"),
      })}
    </div>
  );

  return (
    <AppDialog open onOpenChange={(open, details) => {
      if (!open) { if (modalBusyRef.current) details.cancel(); else onClose(); }
    }}>
    <AppDialogContent size="full" surface="media" padding="none" showCloseButton={false}
      aria-describedby={undefined}
      className="grid gap-0 lg:grid-cols-[1fr_25rem]">
      <AppDialogTitle className="sr-only">{tHistory("detail.title")}</AppDialogTitle>
      <div
        data-testid="history-detail-preview-backdrop"
        role="presentation"
        onClick={onClose}
        className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[#050606] p-6"
      >
        {previewUrl ? (
          hydratedItem.type === "video" ? (
            <video
              data-testid="history-detail-preview-media"
              src={previewUrl}
              controls
              onClick={(event) => event.stopPropagation()}
              className="max-h-[86vh] max-w-full rounded-2xl object-contain"
            />
          ) : hydratedItem.type === "audio" ? (
            <div
              data-testid="history-detail-preview-media"
              role="presentation"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-8"
            >
              <audio src={previewUrl} controls className="w-full" />
            </div>
          ) : (
            <VariantImage
              data-testid="history-detail-preview-media"
              asset={{url: previewUrl, imageVariants: hydratedItem.imageVariants}}
              alt={tHistory("previewAlt")}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[86vh] max-w-full rounded-2xl object-contain shadow-[0_24px_120px_rgba(0,0,0,0.55)]"
            />
          )
        ) : (
          <div
            data-testid="history-detail-preview-media"
            role="presentation"
            onClick={(event) => event.stopPropagation()}
            className="flex h-80 w-full max-w-xl items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
          >
            <ImageIcon className="h-12 w-12 text-gray-500" />
          </div>
        )}
      </div>

      <AppDetailRail
        data-testid="history-detail-rail"
        header={
          <div className="flex justify-end">
            <AppDialogClose asChild><AppCloseButton aria-label={tActions("close")} /></AppDialogClose>
          </div>
        }
        footer={
          <div className="grid gap-2">
            {detailQuery.isError && !detail ? <AppButton type="button" variant="surface" onClick={() => void detailQuery.refetch()}>{tCommonActions("retry")}</AppButton> : null}
            <AppButton
              type="button"
              size="lg"
              variant="generate"
              disabled={item.origin !== "edit" && !detail}
              onClick={() => { if (item.origin === "edit" || detail) onRecreate(hydratedItem); }}
              className="h-12 rounded-xl text-sm shadow-none"
            >
              <RotateCcw className="h-4 w-4" />
              {tActions("recreate")}
            </AppButton>
            <div className="grid grid-cols-2 gap-2">
              <AppButton
                type="button"
                variant="surface"
                disabled={!canUseImageReference}
                onClick={() => onCreateVideo(hydratedItem)}
                className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Video className="h-4 w-4" />
                {tActions("video")}
              </AppButton>
              {hydratedItem.resultUrl ? (
                <AppButton asChild variant="surface" className="h-11 rounded-xl">
                  <a href={historyEndpoint} download aria-label={tActions("download")}><Download className="h-4 w-4" />{tActions("download")}</a>
                </AppButton>
              ) : null}
              <AppButton
                type="button"
                variant="surface"
                disabled={deleting || ["pending", "processing", "uploading"].includes(hydratedItem.status)}
                onClick={() => setConfirmDelete(true)}
                className="col-span-2 h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Trash2 className="h-4 w-4" />
                {tHistory("deleteDialog.confirm")}
              </AppButton>
            </div>
          </div>
        }
      >
        <AppTabs
          ariaLabel={tHistory("detail.tabsAriaLabel")}
          items={[
            {
              value: "prompt",
              label: tHistory("detail.tabPrompt"),
              content: promptTab,
            },
            {
              value: "settings",
              label: tHistory("detail.tabSettings"),
              content: settingsTab,
            },
            {
              value: "metadata",
              label: tHistory("detail.tabMetadata"),
              content: metadataTab,
            },
            {
              value: "history",
              label: tHistory("detail.tabHistory"),
              content: historyTab,
            },
          ]}
        />
      </AppDetailRail>
      <AppConfirmDialog open={confirmDelete} onOpenChange={(open) => {if (!deleting) setConfirmDelete(open);}}>
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader><AppConfirmDialogTitle>{tHistory("deleteDialog.title")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{tHistory("deleteDialog.preserveAssetsDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel disabled={deleting}>{tCommonActions("cancel")}</AppConfirmDialogCancel>
            <AppConfirmDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={deleting} onClick={(event) => {event.preventDefault(); void handleDelete();}}>{deleting && <Loader2 className="h-4 w-4 animate-spin" />}{tHistory("deleteDialog.confirm")}</AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>
    </AppDialogContent>
    </AppDialog>
  );
}
