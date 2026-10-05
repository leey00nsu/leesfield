import type { ComponentProps } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

export const appResourceRowLayoutClassName = "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-5 md:grid-cols-[2.5rem_minmax(0,1fr)_6rem_2rem]";
export const appResourceRowIconClassName = "flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.035]";

export function AppResourceList({ className, ...props }: ComponentProps<"div">) {
  return <AppCard variant="editorial-flat" radius="lg" role="list" className={cn("gap-0 overflow-hidden py-0 [&>div:last-child_article]:border-b-0", className)} {...props} />;
}
