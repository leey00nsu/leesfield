import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { HistoryItem, HistoryItemSkeleton } from "@/features/generation-history/ui/history-item";
import { cn } from "@/shared/lib/utils";
import { AppCard } from "@/shared/ui/app-card";

type HistoryListProps = {
  items: GenerationHistoryItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  onDeleteItem?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
  onSelectItem?: (item: GenerationHistoryItem) => void;
};

function getHistoryTileClass(index: number) {
  const pattern = index % 12;

  if (pattern === 0) {
    return "row-span-4 md:col-span-2 md:row-span-5";
  }
  if (pattern === 2 || pattern === 8) {
    return "row-span-3";
  }
  if (pattern === 5) {
    return "row-span-4";
  }
  if (pattern === 7) {
    return "row-span-3 md:col-span-2";
  }
  return "row-span-2";
}

export function HistoryList({
  items,
  isLoading = false,
  emptyMessage,
  onDeleteItem,
  onSelectItem,
}: HistoryListProps) {
  const tEmpty = useTranslations("history.empty");
  const resolvedEmptyMessage = emptyMessage ?? tEmpty("default");

  if (isLoading) {
    return (
      <div className="grid auto-rows-[7rem] grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <HistoryItemSkeleton
            key={`history-skeleton-${index}`}
            className={getHistoryTileClass(index)}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <AppCard
        variant="editorial-flat"
        className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[1.5rem] px-6 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter">
          <Archive className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-200">
          {tEmpty("title")}
        </h3>
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {resolvedEmptyMessage}
        </p>
      </AppCard>
    );
  }

  return (
    <div
      data-testid="history-gallery-grid"
      className="grid auto-rows-[7rem] grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6"
    >
      {items.map((item, index) => (
        <HistoryItem
          key={`${item.type}-${item.id}`}
          item={item}
          onDeleted={onDeleteItem}
          onSelect={onSelectItem}
          className={cn("min-h-0", getHistoryTileClass(index))}
        />
      ))}
    </div>
  );
}
