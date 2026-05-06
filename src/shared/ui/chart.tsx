"use client";

import type { ComponentProps, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/shared/lib/utils";

interface ChartContainerProps extends ComponentProps<"div"> {
  children: ReactNode;
  height?: number | `${number}%`;
}

export function ChartContainer({
  children,
  className,
  height = 180,
  ...props
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-black/20 p-3",
        className,
      )}
      {...props}
    >
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface ChartTooltipContentProps {
  label?: string;
  rows: Array<{
    label: string;
    value: string;
    color?: string;
  }>;
}

export function ChartTooltipContent({ label, rows }: ChartTooltipContentProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-background-dark/95 px-3 py-2 text-xs text-white shadow-xl">
      {label ? (
        <div className="mb-1 font-mono text-[10px] uppercase text-white/48">
          {label}
        </div>
      ) : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-white/58">
              {row.color ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              {row.label}
            </span>
            <span className="font-medium text-white">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
