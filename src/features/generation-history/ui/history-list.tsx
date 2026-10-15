import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import {
  HistoryItem,
  HistoryItemSkeleton,
} from "@/features/generation-history/ui/history-item";
import { cn } from "@/shared/lib/utils";
import { AppMediaGallery, AppMediaGalleryEmpty, appMediaGalleryTileClassName } from "@/shared/ui/app-media-gallery";

type HistoryListProps = {
  items: GenerationHistoryItem[];
  autoplay?: boolean;
  fit?: "cover" | "contain";
  isLoading?: boolean;
  emptyMessage?: string;
  onDeleteItem?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
  onSelectItem?: (item: GenerationHistoryItem) => void;
};

export function HistoryList({
  items,
  autoplay = true,
  fit = "cover",
  isLoading = false,
  emptyMessage,
  onDeleteItem,
  onSelectItem,
}: HistoryListProps) {
  const tEmpty = useTranslations("history.empty");
  const resolvedEmptyMessage = emptyMessage ?? tEmpty("default");

  if (isLoading) {
    return (
      <AppMediaGallery>
        {Array.from({ length: 12 }).map((_, index) => (
          <HistoryItemSkeleton
            key={`history-skeleton-${index}`}
            className={appMediaGalleryTileClassName}
          />
        ))}
      </AppMediaGallery>
    );
  }

  if (items.length === 0) {
    return (
      <AppMediaGalleryEmpty icon={<Archive className="h-6 w-6 text-gray-500" />} title={tEmpty("title")} description={resolvedEmptyMessage} />
    );
  }

  return (
    <AppMediaGallery
      data-testid="history-gallery-grid"
    >
      {items.map((item) => (
        <HistoryItem
          key={`${item.origin ?? "generation"}-${item.type}-${item.id}`}
          item={item}
          autoplay={autoplay}
          fit={fit}
          onDeleted={onDeleteItem}
          onSelect={onSelectItem}
          className={cn("min-h-0", appMediaGalleryTileClassName)}
        />
      ))}
    </AppMediaGallery>
  );
}
