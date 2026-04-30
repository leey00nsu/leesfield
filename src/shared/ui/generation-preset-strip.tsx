import { WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  GenerationModality,
  GenerationPreset,
} from "@/shared/generation/generation-presets";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";

type GenerationPresetStripProps = {
  modality: GenerationModality;
  items: ReadonlyArray<GenerationPreset>;
  onSelect: (preset: GenerationPreset, prompt: string) => void;
  className?: string;
};

export function GenerationPresetStrip({
  modality,
  items,
  onSelect,
  className,
}: GenerationPresetStripProps) {
  const t = useTranslations("generation.presets");

  return (
    <section
      aria-label={t(`${modality}.ariaLabel`)}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-300">
          {t(`${modality}.title`)}
        </h3>
        <span className="text-xs font-mono text-gray-500">
          {t("hint")}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((preset) => {
          const label = t(preset.labelKey);
          const description = t(preset.descriptionKey);
          const prompt = t(preset.promptKey);

          return (
            <AppButton
              key={preset.id}
              type="button"
              variant="surface"
              className="h-auto min-h-24 flex-col items-start justify-between rounded-xl bg-creative-surface-muted p-4 text-left hover:border-primary/40"
              onClick={() => onSelect(preset, prompt)}
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {label}
                </span>
                <WandSparkles className="h-4 w-4 text-primary" />
              </span>
              <span className="text-xs leading-relaxed text-gray-400">
                {description}
              </span>
            </AppButton>
          );
        })}
      </div>
    </section>
  );
}
