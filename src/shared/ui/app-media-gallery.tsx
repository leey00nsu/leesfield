import type { ComponentProps } from "react";
import { AppSkeleton } from "./app-skeleton";
import { cn } from "@/shared/lib/utils";

export const appMediaGalleryTileClassName = "aspect-square min-h-0 min-w-0";

export function AppMediaGallery({ className, ...props }: ComponentProps<"div">) {
  return <div data-app-media-gallery="" className={cn("grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)} {...props} />;
}

export { AppResourceEmpty as AppMediaGalleryEmpty } from "@/shared/ui/app-resource-list";

export function AppMediaGalleryLoading({ label }: { label: string }) {
  return <AppMediaGallery aria-label={label} aria-busy="true">
    {Array.from({ length: 12 }, (_, index) => <AppSkeleton key={index} surface="media" className={cn("rounded-none", appMediaGalleryTileClassName)} />)}
  </AppMediaGallery>;
}
