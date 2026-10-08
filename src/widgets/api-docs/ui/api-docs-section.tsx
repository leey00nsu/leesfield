import type { ReactNode } from "react";

/** Document headings and spacing are local to the API reference. */
export function ApiDocsSection({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
        {description ? (
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
