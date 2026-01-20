import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { HistoryItem, HistoryItemSkeleton } from "@/features/generation-history/ui/history-item";

type HistoryListProps = {
  items: GenerationHistoryItem[];
  isLoading?: boolean;
  emptyMessage?: string;
};

export function HistoryList({
  items,
  isLoading = false,
  emptyMessage,
}: HistoryListProps) {
  const tEmpty = useTranslations("history.empty");
  const resolvedEmptyMessage = emptyMessage ?? tEmpty("default");

  if (isLoading) {
    return (
      <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <HistoryItemSkeleton key={`history-skeleton-${index}`} />
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
    <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
      {items.map((item) => (
        <HistoryItem key={`${item.type}-${item.id}`} item={item} />
      ))}
    </div>
  );
}
