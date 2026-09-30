"use client";

import { useRef, type KeyboardEvent } from "react";

type ViewTab<T extends string> = { value: T; label: string; disabled?: boolean };

/** Shared source/result tabs for Leesfield node bodies. */
export function NodeViewTabs<T extends string>({ id, label, value, tabs, onChange }: {
  id: string;
  label: string;
  value: T;
  tabs: readonly ViewTab<T>[];
  onChange: (value: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const enabled = tabs.filter(tab => !tab.disabled);
    if (!enabled.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = enabled.findIndex(tab => tab.value === value);
    const index = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
      : (Math.max(0, current) + (event.key === "ArrowLeft" ? -1 : 1) + enabled.length) % enabled.length;
    const next = enabled[index].value;
    onChange(next);
    list.current?.querySelector<HTMLButtonElement>(`[data-view-tab="${next}"]`)?.focus();
  };

  return <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown}
    data-leesfield-component="NodeViewTabs"
    className="inline-flex shrink-0 rounded-full border border-white/10 bg-neutral-950/80 p-1">
    {tabs.map(tab => <button key={tab.value} type="button" role="tab" id={`${id}-${tab.value}-tab`}
      aria-controls={`${id}-${tab.value}-panel`} aria-selected={value === tab.value}
      tabIndex={value === tab.value ? 0 : -1} disabled={tab.disabled} data-view-tab={tab.value}
      onClick={() => onChange(tab.value)}
      className={`nodrag nopan rounded-full px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30 ${value === tab.value ? "bg-white/15 text-white" : "text-white/45 hover:text-white"}`}>
      {tab.label}
    </button>)}
  </div>;
}
