"use client";

import { useState } from "react";
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
import { AppDetailRail, AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppFilterGroup,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";

type HistoryStatusFilter = "all" | Extract<GenerationHistoryStatus, "completed" | "failed">;

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
  const displayTotal = statusFilter === "all" ? total : displayItems.length;
  const hasFilteredState = query.length > 0 || statusFilter !== "all";

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] flex-col gap-8 overflow-x-hidden pb-16">
      <section className="mx-auto flex w-full max-w-[1800px] flex-col gap-8 pt-12 text-center sm:pt-16 lg:pt-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center">
          <AppEyebrow className="mb-4">{tHistory("hero.eyebrow")}</AppEyebrow>
          <AppHeading
            as="h1"
            size="studio"
            className="max-w-[58rem] text-white/95 [text-shadow:0_0_18px_rgba(255,255,255,0.14)]"
          >
            {tHistory("hero.title")}
          </AppHeading>
          <p className="mt-4 max-w-2xl text-[clamp(0.95rem,1.05vw,1.125rem)] font-semibold leading-relaxed text-white/58">
            {tHistory("hero.description")}
          </p>
        </div>

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
        <div className="-mt-5 text-right text-xs font-mono uppercase tracking-widest text-white/38">
          {tCommonLabels("total", { total: displayTotal })}
        </div>
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
          onRecreate={() => {
            const target =
              selectedItem.type === "video"
                ? "/video"
                : selectedItem.type === "audio"
                  ? "/audio"
                  : "/image";
            router.push(buildHistoryGenerationUrl(selectedItem, target));
          }}
          onCreateVideo={() =>
            router.push(
              buildHistoryGenerationUrl(selectedItem, "/video", {
                includeImageReference: true,
              }),
            )
          }
          onEditImage={() =>
            router.push(
              buildHistoryGenerationUrl(selectedItem, "/image", {
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
  onRecreate: () => void;
  onCreateVideo: () => void;
  onEditImage: () => void;
}) {
  const locale = useLocale();
  const tHistory = useTranslations("history");
  const tActions = useTranslations("history.detailActions");
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const previewUrl = item.thumbnailUrl ?? item.resultUrl;
  const canUseImageReference = item.type === "image" && Boolean(item.resultUrl);
  const formattedDate = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(item.createdAt));

  const handleCopyPrompt = () => {
    void navigator.clipboard?.writeText(item.prompt);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tHistory("detail.title")}
      className="fixed inset-0 z-50 grid bg-black/88 text-white lg:grid-cols-[1fr_25rem]"
    >
      <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(212,240,50,0.055),transparent_42%),#050606] p-6">
        {previewUrl ? (
          item.type === "video" ? (
            <video
              src={previewUrl}
              controls
              className="max-h-[86vh] max-w-full rounded-2xl object-contain"
            />
          ) : item.type === "audio" ? (
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-8">
              <audio src={previewUrl} controls className="w-full" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={tHistory("previewAlt")}
              className="max-h-[86vh] max-w-full rounded-2xl object-contain shadow-[0_24px_120px_rgba(0,0,0,0.55)]"
            />
          )
        ) : (
          <div className="flex h-80 w-full max-w-xl items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
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
                <AppEyebrow className="text-[0.68rem]">{tTypes(item.type)}</AppEyebrow>
                <div className="mt-1 font-semibold text-white">{item.model ?? "-"}</div>
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
              onClick={onRecreate}
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
                onClick={onCreateVideo}
                className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Video className="h-4 w-4" />
                {tActions("video")}
              </AppButton>
              {item.resultUrl ? (
                <AppButton asChild variant="surface" className="h-11 rounded-xl">
                  <a href={item.resultUrl} download aria-label={tActions("download")}>
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
                onClick={onEditImage}
                className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Edit className="h-4 w-4" />
                {tActions("edit")}
              </AppButton>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
        <AppDetailSection>
          <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase text-gray-500">
            <span>{tHistory("detail.prompt")}</span>
            <AppButton
              type="button"
              variant="surface"
              size="sm"
              onClick={handleCopyPrompt}
              className="h-7 rounded-md px-2 text-xs"
            >
              <Copy className="h-3.5 w-3.5" />
              {tActions("copy")}
            </AppButton>
          </div>
          <p className="line-clamp-5 text-sm leading-relaxed text-gray-300">
            {item.prompt}
          </p>
        </AppDetailSection>

        <AppDetailSection>
          <div className="mb-3 text-xs font-bold uppercase text-gray-500">
            {tHistory("detail.information")}
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">{tHistory("detail.model")}</dt>
              <dd className="font-semibold text-white">{item.model ?? "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">{tHistory("detail.type")}</dt>
              <dd className="font-semibold text-white">{tTypes(item.type)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">{tHistory("detail.status")}</dt>
              <dd className="font-semibold text-white">{tStatuses(item.status)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">{tHistory("detail.date")}</dt>
              <dd className="font-semibold text-white">{formattedDate}</dd>
            </div>
          </dl>
        </AppDetailSection>
        </div>
      </AppDetailRail>
    </div>
  );
}
