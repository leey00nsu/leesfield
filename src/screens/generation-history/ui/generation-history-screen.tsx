"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingNextRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffset(0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotal(0);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotal(data.total);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((prev) => {
      if (offset === 0) {
        return data.items;
      }
      const merged = [...prev];
      const seen = new Set(prev.map((item) => `${item.type}-${item.id}`));
      for (const item of data.items) {
        const key = `${item.type}-${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return merged;
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
        setOffset((prev) => prev + DEFAULT_LIMIT);
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
