"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Grid2X2,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import type {
  GenerationHistoryItem,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";
import { useHistoryQuery } from "@/features/generation-history/api/use-history-query";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { cn } from "@/shared/lib/utils";

const DEFAULT_LIMIT = 24;

export function GenerationHistoryScreen() {
  const [type, setType] = useState<GenerationHistoryType>("all");
  const [sort, setSort] = useState<GenerationHistorySort>("date_desc");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setTotal(0);
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
    setTotal(data.total);
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
  }, [data, offset]);

  const filterButtonBase =
    "flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider transition-all";

  const renderSortLabel = sort === "date_desc" ? "DATE_DESC" : "DATE_ASC";

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                <span className="text-white">Generation</span>{" "}
                <span className="text-primary">History</span>
              </h1>
              <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                ALL SYSTEMS OPERATIONAL // ARCHIVE ACCESS
              </p>
            </div>
            <div className="w-full md:w-96">
              <div className="group relative flex h-12 w-full items-center overflow-hidden rounded-xl border border-white/10 bg-surface-dark shadow-inner transition-all focus-within:border-primary">
                <div className="flex items-center justify-center pl-4 text-gray-500">
                  <Search className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  placeholder="SEARCH_DATABASE..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="w-full border-none bg-transparent px-3 text-sm font-mono text-white placeholder:text-gray-600 focus:outline-none focus:ring-0"
                />
                <div className="pr-2">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-primary"
                    aria-label="필터 옵션"
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setType("all")}
              aria-pressed={type === "all"}
              className={cn(
                filterButtonBase,
                type === "all"
                  ? "bg-primary text-black hover:bg-primary-dark"
                  : "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white",
              )}
            >
              <Grid2X2 className="h-4 w-4" />
              All
            </button>
            <button
              type="button"
              onClick={() => setType("image")}
              aria-pressed={type === "image"}
              className={cn(
                filterButtonBase,
                type === "image"
                  ? "bg-primary text-black hover:bg-primary-dark"
                  : "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white",
              )}
            >
              <ImageIcon className="h-4 w-4" />
              Images
            </button>
            <button
              type="button"
              onClick={() => setType("video")}
              aria-pressed={type === "video"}
              className={cn(
                filterButtonBase,
                type === "video"
                  ? "bg-primary text-black hover:bg-primary-dark"
                  : "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white",
              )}
            >
              <Video className="h-4 w-4" />
              Videos
            </button>
            <div className="mx-2 h-6 w-px bg-white/10" />
            <button
              type="button"
              onClick={() =>
                setSort((prev) =>
                  prev === "date_desc" ? "date_asc" : "date_desc",
                )
              }
              className="flex h-9 items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-gray-500 transition-colors hover:text-primary"
            >
              <SlidersHorizontal className="h-4 w-4" />
              SORT: {renderSortLabel}
            </button>
            <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
              TOTAL: {total}
            </span>
          </div>
        </div>
      </div>

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
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setOffset((prev) => prev + DEFAULT_LIMIT)}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-surface-dark px-6 py-3 text-xs font-bold uppercase tracking-wider text-gray-200 transition-all hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
