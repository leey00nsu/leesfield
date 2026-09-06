import type { ComponentProps } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

export function AppResourceList({ className, ...props }: ComponentProps<"div">) {
  return <AppCard variant="editorial-flat" radius="lg" role="list" className={cn("gap-0 overflow-hidden py-0 [&>div:last-child_article]:border-b-0", className)} {...props} />;
}
