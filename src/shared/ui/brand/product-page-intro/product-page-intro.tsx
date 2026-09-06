import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

const introVariants = cva("min-w-0", {
  variants: {
    variant: {
      index: "flex flex-wrap items-end justify-between gap-6",
      detail: "flex flex-wrap items-start justify-between gap-8",
      task: "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.36fr)] lg:items-end",
    },
  },
  defaultVariants: { variant: "index" },
});

const titleVariants = cva("font-semibold text-balance", {
  variants: {
    variant: {
      index: "mt-2 text-3xl tracking-[-0.04em] sm:text-[2.5rem]",
      detail: "mt-3 text-[clamp(2.5rem,5vw,4.25rem)] leading-none tracking-[-0.055em]",
      task: "mt-2.5 text-[clamp(2rem,3.5vw,3.15rem)] leading-[1.04] tracking-[-0.045em]",
    },
  },
  defaultVariants: { variant: "index" },
});

type ProductPageIntroProps = ComponentProps<"header"> &
  VariantProps<typeof introVariants> & {
    aside?: ReactNode;
    description?: ReactNode;
    eyebrow: ReactNode;
    meta?: ReactNode;
    title: ReactNode;
  };

function ProductPageIntro({
  aside,
  children,
  className,
  description,
  eyebrow,
  meta,
  title,
  variant = "index",
  ...props
}: ProductPageIntroProps) {
  return (
    <header className={cn(introVariants({ variant }), className)} data-page-intro={variant} {...props}>
      <div className="min-w-0 max-w-3xl">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-data-accent-foreground uppercase">{eyebrow}</p>
        {meta ? <div className="mt-3">{meta}</div> : null}
        <h1 className={titleVariants({ variant })}>{title}</h1>
        {description ? (
          <div className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
            {description}
          </div>
        ) : null}
        {children}
      </div>
      {aside ? <div className="min-w-0 shrink-0">{aside}</div> : null}
    </header>
  );
}

export type { ProductPageIntroProps };
export { introVariants, ProductPageIntro, titleVariants };
