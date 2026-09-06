import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/shared/lib/utils";

const statePanelIconVariants = cva(
  "flex size-11 items-center justify-center rounded-lg bg-muted/55 text-muted-foreground [&_svg]:size-5",
  {
    variants: {
      tone: {
        neutral: "",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        destructive: "bg-destructive/8 text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type StatePanelProps = React.ComponentProps<"section"> &
  VariantProps<typeof statePanelIconVariants> & {
    action?: React.ReactNode;
    description?: React.ReactNode;
    headingLevel?: "h1" | "h2";
    icon?: React.ReactNode;
    title: React.ReactNode;
  };

function StatePanel({
  action,
  className,
  description,
  headingLevel = "h2",
  icon,
  title,
  tone = "neutral",
  ...props
}: StatePanelProps) {
  const Heading = headingLevel;
  return (
    <section
      data-slot="state-panel"
      data-tone={tone}
      className={cn(
        "flex min-h-52 flex-col items-center justify-center bg-background px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className={statePanelIconVariants({ tone })} data-slot="state-panel-icon">
          {icon}
        </span>
      ) : null}
      <Heading className={cn("text-lg font-semibold tracking-tight", icon && "mt-4")}>{title}</Heading>
      {description ? <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </section>
  );
}

export type { StatePanelProps };
export { StatePanel, statePanelIconVariants };
