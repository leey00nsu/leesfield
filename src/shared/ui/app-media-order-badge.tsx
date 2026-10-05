import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

type Props = Omit<ComponentProps<"span">, "children"> & { order: number };

export function AppMediaOrderBadge({ order, className, ...props }: Props) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-1 left-1 select-none rounded-full bg-black/70 px-1.5 text-[10px] tabular-nums text-white",
        className,
      )}
      {...props}
    >
      {order}
    </span>
  );
}
