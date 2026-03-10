import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useSyncExternalStore } from "react";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { HistoryItem, HistoryItemSkeleton } from "@/features/generation-history/ui/history-item";

type HistoryListProps = {
  items: GenerationHistoryItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  onDeleteItem?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
};

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }

      const mediaQueryList = window.matchMedia(query);
      const handler = () => listener();

      if (typeof mediaQueryList.addEventListener === "function") {
        mediaQueryList.addEventListener("change", handler);
        return () => mediaQueryList.removeEventListener("change", handler);
      }

      mediaQueryList.addListener(handler);
      return () => mediaQueryList.removeListener(handler);
    },
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
      }
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}

export function HistoryList({
  items,
  isLoading = false,
  emptyMessage,
  onDeleteItem,
}: HistoryListProps) {
  const tEmpty = useTranslations("history.empty");
  const resolvedEmptyMessage = emptyMessage ?? tEmpty("default");
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const isXlUp = useMediaQuery("(min-width: 1280px)");
  const columnCount = isXlUp ? 4 : isMdUp ? 3 : 2;

  const skeletonColumns = useMemo(() => {
    const columns = Array.from({ length: columnCount }, () => [] as number[]);

    Array.from({ length: 9 }).forEach((_, index) => {
      columns[index % columnCount].push(index);
    });

    return columns;
  }, [columnCount]);

  const itemColumns = useMemo(() => {
    const columns = Array.from({ length: columnCount }, () => [] as GenerationHistoryItem[]);

    items.forEach((item, index) => {
      columns[index % columnCount].push(item);
    });

    return columns;
  }, [columnCount, items]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {skeletonColumns.map((column, columnIndex) => (
          <div
            key={`history-skeleton-column-${columnIndex}`}
            className="grid gap-4"
          >
            {column.map((index) => (
              <HistoryItemSkeleton key={`history-skeleton-${index}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter">
          <Archive className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-200">
          {tEmpty("title")}
        </h3>
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {resolvedEmptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {itemColumns.map((column, columnIndex) => (
        <div
          key={`history-column-${columnIndex}`}
          className="grid gap-4"
        >
          {column.map((item) => (
            <HistoryItem
              key={`${item.type}-${item.id}`}
              item={item}
              onDeleted={onDeleteItem}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
