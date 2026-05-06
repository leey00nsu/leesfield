"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type AppExpandableTextProps = {
  children: ReactNode;
  collapsedLines?: number;
  collapseAfter?: number;
  showMoreLabel: string;
  showLessLabel: string;
  className?: string;
  bodyClassName?: string;
};

export function AppExpandableText({
  children,
  collapsedLines = 3,
  collapseAfter = 160,
  showMoreLabel,
  showLessLabel,
  className,
  bodyClassName,
}: AppExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const stringValue = typeof children === "string" ? children : "";
  const canCollapse = stringValue.length > collapseAfter;
  const clampStyle: CSSProperties =
    canCollapse && !expanded
      ? {
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: collapsedLines,
          overflow: "hidden",
        }
      : {};

  return (
    <div data-app-expandable-text="" className={cn("grid gap-3", className)}>
      <div
        data-expanded={expanded ? "true" : "false"}
        className={cn("min-w-0 whitespace-pre-wrap break-words", bodyClassName)}
        style={clampStyle}
      >
        {children}
      </div>
      {canCollapse ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="w-fit text-xs font-semibold text-primary outline-none transition-colors hover:text-primary focus-visible:text-primary"
        >
          {expanded ? showLessLabel : showMoreLabel}
        </button>
      ) : null}
    </div>
  );
}
