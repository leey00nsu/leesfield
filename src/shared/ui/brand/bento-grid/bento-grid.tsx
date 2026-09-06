import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

// Adapted from Aceternity UI's Bento Grid for Copysinger's semantic tokens.
function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-1 gap-2 md:grid-cols-6", className)} {...props} />;
}

function BentoGridItem({
  children,
  className,
  eyebrow,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <article
      className={cn(
        "group/bento relative flex min-h-64 flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow,transform] duration-300 focus-within:border-foreground/25 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_18px_54px_-36px_oklch(0.2_0.02_285/0.35)] motion-reduce:transform-none",
        className,
      )}
      {...props}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">{children}</div>
      <header className="relative px-4 py-3.5 sm:px-5">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
          ) : null}
          <h2 className="text-xs font-semibold tracking-[-0.015em]">{title}</h2>
        </div>
      </header>
    </article>
  );
}

export { BentoGrid, BentoGridItem };
