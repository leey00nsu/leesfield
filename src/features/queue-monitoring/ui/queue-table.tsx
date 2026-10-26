"use client";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Column<T> = { key: string; label: string; cell: (row: T) => ReactNode; className?: string };

/** The same records become labelled cards on mobile; no duplicate interactive rows. */
export function QueueTable<T>({ label, columns, rows, rowKey, selected }: {
  label: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; selected?: string | null;
}) {
  return <div className="min-w-0 overflow-x-auto rounded-lg border border-border" tabIndex={0}>
    <table aria-label={label} className="block w-full text-xs lg:table">
      <thead className="hidden bg-muted/30 text-[11px] text-muted-foreground lg:table-header-group">
        <tr>{columns.map(column => <th key={column.key} scope="col" className={cn("px-3 py-3 text-left font-normal", column.className)}>{column.label}</th>)}</tr>
      </thead>
      <tbody className="block divide-y divide-border lg:table-row-group">
        {rows.map(row => <tr key={rowKey(row)} className={cn("relative grid grid-cols-2 gap-x-4 gap-y-3 p-4 hover:bg-muted/20 focus-within:bg-muted/20 lg:table-row lg:p-0", selected === rowKey(row) && "bg-data-accent/8")}>
          {columns.map((column, index) => <td key={column.key} className={cn("min-w-0 align-middle lg:px-3 lg:py-2.5", index === 0 && "col-span-2", column.className)}>
            {index > 0 && <span className="mb-1 block text-[10px] text-muted-foreground lg:hidden">{column.label}</span>}
            {column.cell(row)}
          </td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

export const queueRowButton = "text-left font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";
