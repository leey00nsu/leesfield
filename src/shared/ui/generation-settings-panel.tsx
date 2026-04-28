import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface GenerationSettingsPanelProps {
  title?: ReactNode;
  onReset: () => void;
  children: ReactNode;
  className?: string;
}

export function GenerationSettingsPanel({
  title,
  onReset,
  children,
  className,
}: GenerationSettingsPanelProps) {
  const tGeneration = useTranslations("generation");
  const tActions = useTranslations("common.actions");
  const resolvedTitle = title ?? tGeneration("settings");

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-5 rounded-xl border border-creative-surface-border bg-creative-surface-muted px-5 py-5 xl:w-[380px] xl:rounded-none xl:border-l xl:border-white/10 xl:bg-transparent",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-200">
          <span className="h-4 w-1 rounded-full bg-primary/80" />
          {resolvedTitle}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onReset}
          className="text-gray-500 hover:bg-white/5 hover:text-white"
          aria-label={tActions("reset")}
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>
      {children}
    </aside>
  );
}
