import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface GenerationHeaderAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

interface GenerationHeaderActionsProps {
  actions: GenerationHeaderAction[];
  className?: string;
}

export function GenerationHeaderActions({
  actions,
  className,
}: GenerationHeaderActionsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="surface"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-disabled={action.disabled ? "true" : undefined}
          className="h-9 gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
          title={action.title}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
