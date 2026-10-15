import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const modalityColors: Record<string, string> = { T2I: "bg-green-500/20 text-green-300", I2I: "bg-cyan-500/20 text-cyan-300", T2V: "bg-purple-500/20 text-purple-300", I2V: "bg-pink-500/20 text-pink-300", V2V: "bg-orange-500/20 text-orange-300", A2V: "bg-violet-500/20 text-violet-300", T2A: "bg-fuchsia-500/20 text-fuchsia-300", A2A: "bg-blue-500/20 text-blue-300" };

export function AppModalityTag({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-white/10 text-white/70",
        modalityColors[String(children)],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
