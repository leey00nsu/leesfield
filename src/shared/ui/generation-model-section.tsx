import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationModality } from "@/shared/generation/generation-presets";
import { resolveModelOutcomeMetadata } from "@/shared/generation/model-outcome-metadata";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface GenerationModelOption<T extends string> {
  id: T;
  name: string;
  vendor: string;
  modalities?: string[];
}

interface GenerationModelSectionProps<T extends string> {
  modality: GenerationModality;
  title?: ReactNode;
  action?: ReactNode;
  items: ReadonlyArray<GenerationModelOption<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function GenerationModelSection<T extends string>({
  modality,
  title,
  action,
  items,
  activeId,
  onSelect,
  className,
}: GenerationModelSectionProps<T>) {
  const t = useTranslations("generation");
  const tModel = useTranslations("model");
  const tOutcome = useTranslations("model.outcome");
  const resolvedTitle = title ?? t("modelSelect");
  const toneClass = {
    image: "from-primary/18 via-creative-surface to-transparent",
    video: "from-accent-purple/20 via-creative-surface to-transparent",
    audio: "from-cyan-400/18 via-creative-surface to-transparent",
  } satisfies Record<GenerationModality, string>;

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 font-mono">
          {resolvedTitle}
        </h3>
        {action}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((model) => {
          const outcome = resolveModelOutcomeMetadata({
            key: model.id,
            type: modality,
            modalities: model.modalities,
          });

          return (
            <Button
              key={model.id}
              type="button"
              onClick={() => onSelect(model.id)}
              variant="ghost"
              className={cn(
                "group relative h-auto w-full flex-col items-stretch rounded-xl bg-creative-surface-muted p-3 text-left transition-all hover:bg-creative-surface",
                activeId === model.id
                  ? "border-2 border-primary"
                  : "border border-creative-surface-border hover:border-white/20",
              )}
            >
              <div
                className={cn(
                  "relative flex min-h-28 w-full flex-col justify-between overflow-hidden rounded-lg bg-linear-to-br p-3",
                  toneClass[outcome.tone],
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">
                      {model.name}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-primary">
                      {tOutcome(`profiles.${outcome.profile}.bestFor`)}
                    </div>
                  </div>
                  {activeId === model.id ? (
                    <div className="rounded-full bg-black/35 p-1 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {outcome.tags.map((tag) => (
                    <span
                      key={`${model.id}-${tag}`}
                      className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-gray-200"
                      title={tModel(`modality.${tag.toLowerCase()}` as const)}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex w-full flex-col gap-2">
                <div className="text-xs leading-relaxed text-gray-300">
                  {tOutcome(`profiles.${outcome.profile}.style`)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {outcome.strengthKeys.map((strengthKey) => (
                    <span
                      key={`${model.id}-${strengthKey}`}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-gray-300"
                    >
                      {tOutcome(
                        `profiles.${outcome.profile}.strengths.${strengthKey}`,
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-[10px] font-mono text-gray-500">
                  <span className="font-bold uppercase text-gray-400">
                    {tOutcome("labels.technical")}
                  </span>
                  {model.vendor ? <span>{model.vendor}</span> : null}
                  <span>{model.id}</span>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
