import { Boxes } from "lucide-react";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { ModelCard } from "@/features/model-management/ui/model-card";

interface ModelListProps {
  items: ModelCatalogItem[];
  emptyMessage?: string;
}

export function ModelList({
  items,
  emptyMessage = "모델이 없습니다.",
}: ModelListProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter">
          <Boxes className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-200">Models Empty</h3>
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
      {items.map((item) => (
        <ModelCard key={`${item.type}-${item.key}`} item={item} />
      ))}
    </div>
  );
}
