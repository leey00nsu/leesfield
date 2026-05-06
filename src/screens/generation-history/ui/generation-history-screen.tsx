"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Copy,
  Download,
  Edit,
  Grid2X2,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  X,
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
import { AppEyebrow } from "@/shared/ui/app-typography";
import { appToast } from "@/shared/ui/app-toast";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import { formatDuration } from "@/features/monitoring-dashboard/lib/format";

type HistoryStatusFilter = "all" | Extract<GenerationHistoryStatus, "completed" | "failed">;
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
  if (options.includeImageReference && item.type === "image" && item.resultUrl) {
    params.set("initImage", item.resultUrl);
  }
  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

function formatFallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function formatProgress(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "-";
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
  const [searchInput, setSearchInput] = useState("");
  const [selectedItem, setSelectedItem] = useState<GenerationHistoryItem | null>(null);
  const debouncedQuery = useDebouncedValue(searchInput, 350);
  const query = debouncedQuery.trim();
  const { items, total, isLoading, error, sentinelRef, removeItem } =
    useGenerationHistoryList({
      type,
      sort,
      query,
    });

  const displayItems =
    statusFilter === "all"
      ? items
      : items.filter((item) => item.status === statusFilter);
  const hasFilteredState = query.length > 0 || statusFilter !== "all";

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] flex-col gap-8 overflow-x-hidden pb-16">
      <section className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 pt-6 sm:pt-8 lg:pt-10">
        <AppFilterToolbar>
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
          </AppFilterGroup>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row lg:max-w-3xl">
            <AppSearchField
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tHistory("filters.searchPlaceholder")}
              aria-label={tHistory("filters.search")}
            />
            <AppSortSelect
              value={sort}
              onValueChange={(value) => setSort(value as GenerationHistorySort)}
              ariaLabel={tHistory("filters.sort")}
              className="sm:w-[12rem] sm:flex-none"
              options={[
                { value: "date_desc", label: tCommonLabels("dateDesc") },
                { value: "date_asc", label: tCommonLabels("dateAsc") },
              ]}
            />
          </div>
        </AppFilterToolbar>
      </section>

      <div className="mx-auto w-full max-w-[1800px]">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tHistory("error")}
          </div>
        ) : (
          <HistoryList
            items={displayItems}
            isLoading={isLoading && items.length === 0}
            onDeleteItem={removeItem}
            onSelectItem={setSelectedItem}
            emptyMessage={
              hasFilteredState ? tHistory("empty.search") : tHistory("empty.default")
            }
          />
        )}
        {!error && items.length > 0 && items.length < total && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div
              ref={sentinelRef}
              data-testid="history-infinite-sentinel"
              aria-hidden="true"
              className="h-8 w-full max-w-xs"
            />
            {isLoading && (
              <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {tCommonActions("loading")}
              </span>
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
          onEditImage={(item) =>
            router.push(
              buildHistoryGenerationUrl(item, "/image", {
                includeImageReference: true,
              }),
            )
          }
        />
      ) : null}
    </div>
  );
}

function HistoryDetailOverlay({
  item,
  onClose,
  onRecreate,
  onCreateVideo,
  onEditImage,
}: {
  item: GenerationHistoryItem;
  onClose: () => void;
  onRecreate: (item: GenerationHistoryItem) => void;
  onCreateVideo: (item: GenerationHistoryItem) => void;
  onEditImage: (item: GenerationHistoryItem) => void;
}) {
  const locale = useLocale();
  const tHistory = useTranslations("history");
  const tActions = useTranslations("history.detailActions");
  const tCommonActions = useTranslations("common.actions");
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const detailQuery = useMonitoringRequestDetail(item.type, item.id, true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const detail = detailQuery.data ?? null;
  const hydratedItem = hydrateHistoryItem(item, detail);
  const previewUrl = hydratedItem.thumbnailUrl ?? hydratedItem.resultUrl;
  const canUseImageReference =
    hydratedItem.type === "image" && Boolean(hydratedItem.resultUrl);
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
  const thumbnailUrl = hydratedItem.thumbnailUrl ?? hydratedItem.resultUrl ?? null;
  const warningMessage = detail?.warningMessage ?? null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const settingsRows = [
    { label: tHistory("detail.model"), value: formatFallback(hydratedItem.model) },
    { label: tHistory("detail.type"), value: tTypes(hydratedItem.type) },
    { label: tHistory("detail.status"), value: tStatuses(hydratedItem.status) },
    { label: tHistory("detail.progress"), value: formattedProgress },
  ];
  const metadataRows = [
    { label: tHistory("detail.requestId"), value: hydratedItem.id },
    { label: tHistory("detail.requestedAt"), value: formattedRequestedAt },
    { label: tHistory("detail.completedAt"), value: completedAt },
    { label: tHistory("detail.duration"), value: formattedDuration },
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
    <AppDetailSection className="p-4">{renderRows(settingsRows)}</AppDetailSection>
  );

  const metadataTab = (
    <AppDetailSection className="p-4">{renderRows(metadataRows)}</AppDetailSection>
  );

  const historyTab = (
    <div className="grid gap-3">
      {renderMediaPreview({
        label: inputLabel,
        url: hydratedItem.type === "audio" ? primaryInputAudio : primaryInputImage,
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
      {renderMediaPreview({
        label: resultLabel,
        url: thumbnailUrl ?? resultUrl,
        type: hydratedItem.type,
        empty: tHistory("detail.noResultAsset"),
      })}
    </div>
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={tHistory("detail.title")}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid bg-black/88 text-white lg:grid-cols-[1fr_25rem]"
    >
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-testid="history-detail-preview-media"
              src={previewUrl}
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-black">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <AppEyebrow className="text-[0.68rem]">
                  {tTypes(hydratedItem.type)}
                </AppEyebrow>
                <div className="mt-1 font-semibold text-white">
                  {formatFallback(hydratedItem.model)}
                </div>
              </div>
            </div>
            <AppButton
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={tActions("close")}
              className="rounded-full"
            >
              <X className="h-4 w-4" />
            </AppButton>
          </div>
        }
        footer={
          <div className="grid gap-2">
            <AppButton
              type="button"
              size="lg"
              onClick={() => onRecreate(hydratedItem)}
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
                  <a
                    href={hydratedItem.resultUrl}
                    download
                    aria-label={tActions("download")}
                  >
                    <Download className="h-4 w-4" />
                    {tActions("download")}
                  </a>
                </AppButton>
              ) : null}
              <AppButton
                type="button"
                variant="surface"
                disabled
                className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles className="h-4 w-4" />
                {tActions("upscale")}
              </AppButton>
              <AppButton
                type="button"
                variant="surface"
                disabled={!canUseImageReference}
                onClick={() => onEditImage(hydratedItem)}
                className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Edit className="h-4 w-4" />
                {tActions("edit")}
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
    </div>
  );
}
