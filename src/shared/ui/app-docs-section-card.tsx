import type { ReactNode } from "react";
import { AppCard, AppCardContent } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

type AppDocsSectionCardProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
};

export function AppDocsSectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  headerClassName,
  bodyClassName,
}: AppDocsSectionCardProps) {
  return (
    <AppCard variant="plain" className={cn("gap-0 py-0", className)}>
      <AppCardContent className={cn("p-0", bodyClassName)}>
        <div
          className={cn(
            "flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-start sm:justify-between",
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">
                {eyebrow}
              </div>
            ) : null}
            <div className="text-lg font-semibold tracking-[-0.02em] text-white sm:text-xl">
              {title}
            </div>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="px-5 py-5">{children}</div>
      </AppCardContent>
    </AppCard>
  );
}
