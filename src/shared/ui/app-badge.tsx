import type { ComponentProps } from "react";
import { Badge } from "@/shared/ui/badge";

type AppBadgeProps = ComponentProps<typeof Badge>;

export function AppBadge(props: AppBadgeProps) {
  return <Badge data-app-badge="" {...props} />;
}
