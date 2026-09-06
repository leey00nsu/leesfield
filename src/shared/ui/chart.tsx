"use client";
import type { ComponentProps, ReactNode } from "react";
import {
  ChartContainer as BrandChartContainer,
  ChartTooltipContent as BrandTooltip,
} from "@/shared/ui/brand/chart/chart";
import { cn } from "@/shared/lib/utils";
interface ChartContainerProps extends ComponentProps<"div"> {
  children: ReactNode;
  height?: number | `${number}%`;
}
export function ChartContainer({
  children,
  className,
  height = 180,
  style,
  ...props
}: ChartContainerProps) {
  return (
    <BrandChartContainer
      config={{}}
      className={cn("aspect-auto", className)}
      style={{ ...style, height }}
      {...props}
    >
      {children}
    </BrandChartContainer>
  );
}
interface ChartTooltipContentProps {
  label?: string;
  rows: Array<{ label: string; value: string; color?: string }>;
}
export function ChartTooltipContent({ label, rows }: ChartTooltipContentProps) {
  return (
    <BrandTooltip
      active
      label={label}
      payload={rows.map((row) => ({
        name: row.label,
        value: row.value,
        color: row.color,
        dataKey: row.label,
        graphicalItemId: row.label,
        payload: row,
      }))}
    />
  );
}
