import type { ComponentProps, ReactNode } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

export const appResourceRowLayoutClassName = "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] min-h-28 items-center gap-4 border-b px-4 py-5 md:grid-cols-[2.5rem_minmax(0,1fr)_6rem_2rem]";
export const appResourceRowIconClassName = "flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.035]";

export function AppResourceList({ className, ...props }: ComponentProps<"div">) {
  return <AppCard variant="editorial-flat" radius="lg" role="list" className={cn("gap-0 overflow-hidden py-0 [&>div:last-child_article]:border-b-0", className)} {...props} />;
}

export function AppResourceEmpty({ icon, title, description, children }: {
  icon: ReactNode; title?: string; description: string; children?: ReactNode;
}) {
  return <AppCard variant="editorial-flat" radius="lg" className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
    <div aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter [&_svg]:size-6 [&_svg]:text-gray-500">{icon}</div>
    {title && <h3 className="text-lg font-bold text-gray-200">{title}</h3>}
    <p className="text-xs font-sans uppercase tracking-widest text-gray-500">{description}</p>
    {children}
  </AppCard>;
}
