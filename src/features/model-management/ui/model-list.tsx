import { Boxes } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { ModelCard, modelRowLayoutClassName } from "@/features/model-management/ui/model-card";

import { AppResourceList, AppResourceEmpty } from "@/shared/ui/app-resource-list";

interface ModelListProps {
  items: ModelCatalogItem[];
  emptyMessage?: string;
  onEdit?: (key: string) => void;
}

export function ModelList({ items, emptyMessage, onEdit }: ModelListProps) {
  const tEmpty = useTranslations("model.empty");
  const resolvedEmptyMessage = emptyMessage ?? tEmpty("default");

  if (items.length === 0) {
    return (
      <AppResourceEmpty icon={<Boxes />} title={tEmpty("title")} description={resolvedEmptyMessage} />
    );
  }

  return (
    <AppResourceList
      aria-label={tEmpty("listLabel")}
    >
      {items.map((item) => (
        <div key={`${item.type}-${item.key}`} role="listitem">
          <ModelCard item={item} onEdit={onEdit} />
        </div>
      ))}
    </AppResourceList>
  );
}

export function ModelListLoading({ label }: { label: string }) {
  return <div role="status" aria-label={label}><AppResourceList aria-hidden="true">
    {Array.from({length: 4}, (_, index) => <div key={index}><article className={modelRowLayoutClassName}>
      <AppSkeleton className="size-10 rounded-md" />
      <div className="min-w-0"><AppSkeleton className="h-5 w-3/5 max-w-60" /><div className="mt-2 flex items-center gap-2"><AppSkeleton className="h-4 w-16" /><AppSkeleton className="h-4 w-10" /><AppSkeleton className="h-6 w-12" /></div></div>
      <div className="col-start-2 flex items-center gap-2 md:col-auto"><AppSkeleton className="size-3 rounded-full" /><AppSkeleton className="h-4 w-10" /></div>
      <div className="flex justify-end"><AppSkeleton className="size-4" /></div>
    </article></div>)}
  </AppResourceList></div>;
}
