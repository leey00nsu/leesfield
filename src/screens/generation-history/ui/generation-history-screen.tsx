"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Grid2X2, Image as ImageIcon, SlidersHorizontal, Video } from "lucide-react";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { useHistoryQuery } from "@/features/generation-history/api/use-history-query";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import {
  PageHeader,
  PageHeaderSearchInput,
} from "@/shared/ui/page-header";
import { Button } from "@/shared/ui/button";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";

const DEFAULT_LIMIT = 24;

export function GenerationHistoryScreen() {
  const [type, setType] = useState<GenerationHistoryType>("all");
  const [sort, setSort] = useState<GenerationHistorySort>("date_desc");
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebouncedValue(searchInput, 350);
  const query = debouncedQuery.trim();
  const [{ offset, items, total }, dispatch] = useReducer(
    (
      state: {
        offset: number;
        items: GenerationHistoryItem[];
        total: number;
      },
      action:
        | { type: "reset" }
        | { type: "advance"; amount: number }
        | { type: "replace"; items: GenerationHistoryItem[]; total: number }
        | { type: "append"; items: GenerationHistoryItem[]; total: number },
    ) => {
      switch (action.type) {
        case "reset":
          return { offset: 0, items: [], total: 0 };
        case "advance":
          return { ...state, offset: state.offset + action.amount };
        case "replace":
          return { ...state, items: action.items, total: action.total };
        case "append": {
          const merged = [...state.items];
          const seen = new Set(
            state.items.map((item) => `${item.type}-${item.id}`),
          );
          for (const item of action.items) {
            const key = `${item.type}-${item.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          return { ...state, items: merged, total: action.total };
        }
        default:
          return state;
      }
    },
    { offset: 0, items: [], total: 0 },
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextRef = useRef(false);

  useEffect(() => {
    dispatch({ type: "reset" });
    isFetchingNextRef.current = false;
  }, [type, sort, query]);

  const params = useMemo(
    () => ({
      type,
      query,
      sort,
      limit: DEFAULT_LIMIT,
      offset,
    }),
    [type, query, sort, offset],
  );

  const { data, isLoading, error } = useHistoryQuery(params);

  useEffect(() => {
    if (!data) return;
    dispatch({
      type: offset === 0 ? "replace" : "append",
      items: data.items,
      total: data.total,
    });
    isFetchingNextRef.current = false;
  }, [data, offset]);

  useEffect(() => {
    if (error) {
      isFetchingNextRef.current = false;
    }
  }, [error]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (error) return;
        if (isLoading) return;
        if (total === 0 || items.length >= total) return;
        if (isFetchingNextRef.current) return;
        isFetchingNextRef.current = true;
        dispatch({ type: "advance", amount: DEFAULT_LIMIT });
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [error, isLoading, items.length, total]);

  const renderSortLabel = sort === "date_desc" ? "DATE_DESC" : "DATE_ASC";

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">Generation</span>{" "}
            <span className="text-primary">History</span>
          </>
        }
        subtitle="FIND YOUR GENERATIONS FAST"
        rightSlot={
          <PageHeaderSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="SEARCH_DATABASE..."
            filterButtonLabel="필터 옵션"
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
            All
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("image")}
            aria-pressed={type === "image"}
            active={type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            Images
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("video")}
            aria-pressed={type === "video"}
            active={type === "video"}
            icon={<Video className="h-4 w-4" />}
          >
            Videos
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
            SORT: {renderSortLabel}
          </Button>
          <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
            TOTAL: {total}
          </span>
        </DashboardFilterBar>
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : (
          <HistoryList
            items={items}
            isLoading={isLoading && items.length === 0}
            emptyMessage={query ? "검색 결과가 없습니다." : "히스토리가 비어 있습니다."}
          />
        )}
        {!error && items.length > 0 && items.length < total && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div
              ref={sentinelRef}
              className="h-8 w-full max-w-xs rounded-full border border-white/10 bg-surface-dark/60"
            />
            {isLoading && (
              <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
                Loading...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
