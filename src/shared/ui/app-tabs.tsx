"use client";
import type { KeyboardEvent, ReactNode } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/brand/tabs/tabs";
export type AppTabItem = {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
};
export function AppTabs({
  items,
  defaultValue,
  value,
  onValueChange,
  selectionOnly = false,
  ariaLabel,
  className,
  listClassName,
  panelClassName,
  triggerClassName,
}: {
  items: AppTabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Reuse the common tab appearance for a choice that has no content panels. */
  selectionOnly?: boolean;
  ariaLabel: string;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
  triggerClassName?: string;
}) {
  return (
    <Tabs
      data-horizontal=""
      defaultValue={defaultValue ?? items[0]?.value}
      value={value}
      onValueChange={(next) => { if (typeof next === "string") onValueChange?.(next); }}
      className={className}
    >
      <TabsList aria-label={ariaLabel} className={listClassName}
        {...(selectionOnly ? { role: "radiogroup", activateOnFocus: true } : {})}
        onKeyDownCapture={selectionOnly ? selectionKeys : undefined}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value} disabled={item.disabled} className={triggerClassName}
            render={selectionOnly ? (props, state) => <button {...props} disabled={state.disabled} role="radio" aria-checked={state.active} aria-selected={undefined} aria-controls={undefined} /> : undefined}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {!selectionOnly && items.filter((item) => item.content !== undefined).map((item) => (
        <TabsContent
          key={item.value}
          value={item.value}
          className={panelClassName}
        >
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function selectionKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    .filter(button => !button.disabled && button.getAttribute("aria-disabled") !== "true");
  if (!buttons.length) return;
  const current = buttons.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement);
  const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
  const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
    : (current + (forward ? 1 : buttons.length - 1)) % buttons.length;
  // Base UI maintains roving focus and commits the value through activateOnFocus.
  buttons[next]?.focus();
}
