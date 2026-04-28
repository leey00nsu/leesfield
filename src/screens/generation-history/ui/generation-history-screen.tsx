"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  Copy,
  Download,
  Edit,
  Grid2X2,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { useGenerationHistoryList } from "@/features/generation-history/hook/use-generation-history-list";
import { Button } from "@/shared/ui/button";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";

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

  const renderSortLabel =
    sort === "date_desc" ? tCommonLabels("dateDesc") : tCommonLabels("dateAsc");

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] flex-col gap-4 overflow-x-hidden pb-36">
      <div className="sticky top-0 z-30 -mx-6 border-b border-white/10 bg-[#0b0e10]/90 px-6 py-3 backdrop-blur-xl sm:-mx-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3">
          <div className="flex h-10 min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 sm:max-w-md">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tCommonLabels("searchPlaceholder")}
              className="w-full border-none bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
          </div>

          <DashboardFilterBar>
          <DashboardFilterToggle
            onClick={() => setType("all")}
            aria-pressed={type === "all"}
            active={type === "all"}
            icon={<Grid2X2 className="h-4 w-4" />}
          >
            {tCommonLabels("all")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("image")}
            aria-pressed={type === "image"}
            active={type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            {tCommonLabels("images")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("video")}
            aria-pressed={type === "video"}
            active={type === "video"}
            icon={<Video className="h-4 w-4" />}
          >
            {tCommonLabels("videos")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("audio")}
            aria-pressed={type === "audio"}
            active={type === "audio"}
            icon={<AudioLines className="h-4 w-4" />}
          >
            {tCommonLabels("audios")}
          </DashboardFilterToggle>
          <DashboardFilterDivider />
          <Button
            type="button"
            onClick={() =>
              setSort((prev) =>
                prev === "date_desc" ? "date_asc" : "date_desc",
              )
            }
            variant="ghost"
            className="h-9 gap-2 px-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-transparent hover:text-primary"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {tCommonLabels("sort", { order: renderSortLabel })}
          </Button>
          <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {tCommonLabels("total", { total })}
          </span>
        </DashboardFilterBar>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1800px]">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tHistory("error")}
          </div>
        ) : (
          <HistoryList
            items={items}
            isLoading={isLoading && items.length === 0}
            onDeleteItem={removeItem}
            onSelectItem={setSelectedItem}
            emptyMessage={
              query ? tHistory("empty.search") : tHistory("empty.default")
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
      <HistoryFloatingPromptDock />
    </div>
  );
}

function HistoryFloatingPromptDock() {
  const tHistory = useTranslations("history");

  return (
    <div className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-[#1a1d20]/94 p-4 shadow-[0_18px_90px_rgba(0,0,0,0.52)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 text-white">
            <Plus className="h-5 w-5" />
          </span>
          <span className="truncate text-sm text-gray-400">
            {tHistory("floatingDock.placeholder")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white">
            {tHistory("floatingDock.model")}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white">
            3:4
          </span>
          <Button asChild variant="hero" className="h-12 rounded-xl px-6 shadow-none">
            <Link href="/image">
              {tHistory("floatingDock.generate")}
              <Sparkles className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
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
      className="fixed inset-0 z-50 grid bg-black/82 text-white lg:grid-cols-[1fr_24rem]"
    >
      <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08),transparent_48%)] p-6">
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

      <aside className="flex min-h-0 flex-col gap-5 border-l border-white/10 bg-[#0f1316] p-4 shadow-[-24px_0_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-black">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="font-bold text-white">{item.model ?? "-"}</div>
              <div className="text-xs text-gray-500">{tHistory("detail.author")}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={tActions("close")}
            className="rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase text-gray-500">
            <span>{tHistory("detail.prompt")}</span>
            <Button
              type="button"
              variant="surface"
              size="sm"
              onClick={handleCopyPrompt}
              className="h-7 rounded-md px-2 text-xs"
            >
              <Copy className="h-3.5 w-3.5" />
              {tActions("copy")}
            </Button>
          </div>
          <p className="line-clamp-5 text-sm leading-relaxed text-gray-300">
            {item.prompt}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
        </section>

        <div className="mt-auto grid gap-2">
          <Button
            type="button"
            variant="hero"
            onClick={onRecreate}
            className="h-12 rounded-xl text-sm shadow-none"
          >
            <RotateCcw className="h-4 w-4" />
            {tActions("recreate")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="surface"
              disabled={!canUseImageReference}
              onClick={onCreateVideo}
              className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Video className="h-4 w-4" />
              {tActions("video")}
            </Button>
            {item.resultUrl ? (
              <Button asChild variant="surface" className="h-11 rounded-xl">
                <a href={item.resultUrl} download aria-label={tActions("download")}>
                  <Download className="h-4 w-4" />
                  {tActions("download")}
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="surface"
              disabled
              className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-4 w-4" />
              {tActions("upscale")}
            </Button>
            <Button
              type="button"
              variant="surface"
              disabled={!canUseImageReference}
              onClick={onEditImage}
              className="h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Edit className="h-4 w-4" />
              {tActions("edit")}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
