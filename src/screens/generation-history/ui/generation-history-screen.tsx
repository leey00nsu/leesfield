"use client";

import { useState } from "react";
import {
  Grid2X2,
  Image as ImageIcon,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { useGenerationHistoryList } from "@/features/generation-history/hook/use-generation-history-list";
import { PageHeader, PageHeaderSearchInput } from "@/shared/ui/page-header";
import { Button } from "@/shared/ui/button";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";

export function GenerationHistoryScreen() {
  const tHistory = useTranslations("history");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const [type, setType] = useState<GenerationHistoryType>("all");
  const [sort, setSort] = useState<GenerationHistorySort>("date_desc");
  const [searchInput, setSearchInput] = useState("");
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
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tHistory("title.leading")}</span>{" "}
            <span className="text-primary">{tHistory("title.accent")}</span>
          </>
        }
        subtitle={tHistory("subtitle")}
        rightSlot={
          <PageHeaderSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={tCommonLabels("searchPlaceholder")}
            filterButtonLabel={tCommonLabels("filterOptions")}
          />
        }
      >
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
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tHistory("error")}
          </div>
        ) : (
          <HistoryList
            items={items}
            isLoading={isLoading && items.length === 0}
            onDeleteItem={removeItem}
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
    </div>
  );
}
