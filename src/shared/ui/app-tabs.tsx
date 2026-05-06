"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export type AppTabItem = {
  value: string;
  label: ReactNode;
  content: ReactNode;
};

type AppTabsProps = {
  items: AppTabItem[];
  defaultValue?: string;
  ariaLabel: string;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
};

export function AppTabs({
  items,
  defaultValue,
  ariaLabel,
  className,
  listClassName,
  panelClassName,
}: AppTabsProps) {
  const id = useId();
  const [selectedValue, setSelectedValue] = useState(
    defaultValue ?? items[0]?.value ?? "",
  );
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selectedValue),
  );
  const selectedItem = items[selectedIndex];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;

    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;

    if (direction === 0) {
      if (event.key === "Home") {
        event.preventDefault();
        setSelectedValue(items[0].value);
      }
      if (event.key === "End") {
        event.preventDefault();
        setSelectedValue(items[items.length - 1].value);
      }
      return;
    }

    event.preventDefault();
    const nextIndex = (selectedIndex + direction + items.length) % items.length;
    setSelectedValue(items[nextIndex].value);
  };

  return (
    <div data-app-tabs="" className={cn("grid gap-5", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={cn(
          "grid grid-cols-4 border-b border-white/10 text-sm font-semibold text-white/46",
          listClassName,
        )}
      >
        {items.map((item) => {
          const selected = item.value === selectedItem?.value;
          const tabId = `${id}-${item.value}-tab`;
          const panelId = `${id}-${item.value}-panel`;

          return (
            <button
              key={item.value}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedValue(item.value)}
              className={cn(
                "relative min-h-12 px-2 pb-3 pt-1 text-center transition-colors outline-none focus-visible:text-primary",
                "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-transparent after:transition-colors",
                selected && "text-primary after:bg-primary",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {selectedItem ? (
        <div
          id={`${id}-${selectedItem.value}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${selectedItem.value}-tab`}
          className={cn("min-w-0", panelClassName)}
        >
          {selectedItem.content}
        </div>
      ) : null}
    </div>
  );
}
