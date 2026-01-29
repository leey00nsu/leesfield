import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface GenerationModelOption<T extends string> {
  id: T;
  name: string;
  vendor: string;
  modalities?: string[];
}

interface GenerationModelSectionProps<T extends string> {
  title?: ReactNode;
  action?: ReactNode;
  items: ReadonlyArray<GenerationModelOption<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function GenerationModelSection<T extends string>({
  title,
  action,
  items,
  activeId,
  onSelect,
  className,
}: GenerationModelSectionProps<T>) {
  const t = useTranslations("generation");
  const tModel = useTranslations("model");
  const resolvedTitle = title ?? t("modelSelect");

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 font-mono">
          {resolvedTitle}
        </h3>
        {action}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((model) => (
          <Button
            key={model.id}
            type="button"
            onClick={() => onSelect(model.id)}
            variant="ghost"
            className={cn(
              "group relative h-auto w-full flex-col rounded-xl bg-surface-dark p-1 text-left transition-all hover:bg-surface-dark",
              activeId === model.id
                ? "border-2 border-primary"
                : "border border-white/5 hover:border-white/20"
            )}
          >
            <div className="relative h-24 w-full overflow-hidden rounded-lg bg-black">
              <div className="absolute inset-0 bg-linear-to-br from-white/10 via-black/70 to-black opacity-60 transition-opacity group-hover:opacity-80" />
              <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-2 left-3">
                <div className="text-sm font-bold text-white">{model.name}</div>
                <div className="text-[10px] font-mono text-primary">
                  {model.vendor}
                </div>
                {model.modalities && model.modalities.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {model.modalities.map((modality) => (
                      <span
                        key={`${model.id}-${modality}`}
                        className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-gray-200"
                        title={tModel(
                          `modality.${modality.toLowerCase()}` as const,
                        )}
                      >
                        {modality}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {activeId === model.id && (
              <div className="absolute right-3 top-3 rounded-full bg-black/50 p-1 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
          </Button>
        ))}
      </div>
    </section>
  );
}
