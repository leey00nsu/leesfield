import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui/skeleton";

type AppSkeletonProps = ComponentProps<typeof Skeleton> & {
  surface?: "default" | "media";
};

const appSkeletonSurfaceClassNames: Record<
  NonNullable<AppSkeletonProps["surface"]>,
  string
> = {
  default: "bg-white/10",
  media: "bg-white/10",
};

export function AppSkeleton({
  surface = "default",
  className,
  ...props
}: AppSkeletonProps) {
  return (
    <Skeleton
      data-app-skeleton=""
      className={cn(appSkeletonSurfaceClassNames[surface], className)}
      {...props}
    />
  );
}
