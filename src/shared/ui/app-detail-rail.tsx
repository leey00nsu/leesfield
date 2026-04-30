import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { AppCard } from "@/shared/ui/app-card";

type AppDetailRailProps = ComponentProps<typeof AppCard> & {
  header?: ReactNode;
  footer?: ReactNode;
};

export function AppDetailRail({
  className,
  header,
  footer,
  children,
  ...props
}: AppDetailRailProps) {
  return (
    <AppCard
      data-app-detail-rail=""
      variant="editorial"
      className={cn(
        "h-full rounded-none border-y-0 border-r-0 border-white/12 p-0 shadow-[-24px_0_90px_rgba(0,0,0,0.45)] [background:radial-gradient(circle_at_50%_0%,rgba(212,240,50,0.04),transparent_26rem),linear-gradient(180deg,rgba(10,12,8,0.96),rgba(5,6,4,0.98))]",
        className,
      )}
      {...props}
    >
      {header ? <div className="border-b border-white/10 p-5">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      {footer ? <div className="border-t border-white/10 p-5">{footer}</div> : null}
    </AppCard>
  );
}

export function AppDetailSection({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      data-app-detail-section=""
      className={cn(
        "rounded-2xl border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
      {...props}
    />
  );
}
