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
    <AppCard
      variant="editorial-flat"
      className={cn("rounded-[1.4rem] border-white/12", className)}
    >
      <AppCardContent className={cn("p-0", bodyClassName)}>
        <div
          className={cn(
            "flex flex-col gap-6 border-b border-white/8 px-6 py-6 sm:flex-row sm:items-start sm:justify-between",
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">
                {eyebrow}
              </div>
            ) : null}
            <div className="text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">
              {title}
            </div>
            {description ? (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="px-6 py-6">{children}</div>
      </AppCardContent>
    </AppCard>
  );
}
