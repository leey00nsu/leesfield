import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type GenerationSettingsPanelProps = {
  title?: ReactNode;
  onReset: () => void;
  children: ReactNode;
  className?: string;
};

export function GenerationSettingsPanel({
  title = "Settings",
  onReset,
  children,
  className,
}: GenerationSettingsPanelProps) {
  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-6 rounded-2xl border border-white/10 bg-background-dark px-6 py-6 shadow-2xl xl:w-[400px] xl:rounded-none xl:border-l xl:border-white/10 xl:bg-transparent xl:shadow-none",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-white">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          {title}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onReset}
          className="text-gray-500 hover:bg-white/5 hover:text-white"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>
      {children}
    </aside>
  );
}
