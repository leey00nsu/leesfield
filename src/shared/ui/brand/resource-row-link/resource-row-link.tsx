import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export const resourceRowInteractiveClassName =
  "group/resource-row relative isolate cursor-pointer transition-colors hover:bg-muted/35 focus-within:bg-muted/35";

const stretchedRowActionClassName =
  "after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset";

export function ResourceRowLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn(stretchedRowActionClassName, className)} data-resource-row-link="" {...props} />;
}

export function ResourceRowButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return (
    <button className={cn(stretchedRowActionClassName, className)} data-resource-row-button="" type={type} {...props} />
  );
}
