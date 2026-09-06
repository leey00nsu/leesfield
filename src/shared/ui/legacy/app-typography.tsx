import type { ComponentProps, ElementType } from "react";
import { cn } from "@/shared/lib/utils";

type AppHeadingSize = "hero" | "section" | "studio" | "compact";

type AppHeadingProps = ComponentProps<"h1"> & {
  as?: "h1" | "h2" | "h3";
  size?: AppHeadingSize;
};

const headingSizeClasses: Record<AppHeadingSize, string> = {
  hero: "text-[clamp(2.15rem,3.55vw,3.85rem)] leading-[0.98]",
  section: "text-[clamp(2.4rem,4.6vw,5.2rem)] leading-[0.96]",
  studio: "text-[clamp(2.35rem,4.8vw,5.15rem)] leading-[0.94]",
  compact: "text-[clamp(2rem,3.5vw,3.75rem)] leading-[0.98]",
};

export function AppHeading({
  as = "h2",
  size = "section",
  className,
  ...props
}: AppHeadingProps) {
  const Component = as as ElementType;

  return (
    <Component
      data-app-heading=""
      className={cn(
        "font-display font-normal tracking-[-0.035em] text-white",
        headingSizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

export function AppEyebrow({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-app-eyebrow=""
      className={cn(
        "text-[0.78rem] font-bold uppercase tracking-[0.18em] text-primary",
        className,
      )}
      {...props}
    />
  );
}
