"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const Scope = createContext(false);
export function NodeTextEditorScope({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
  return <Scope.Provider value={enabled}>{children}</Scope.Provider>;
}
export function useNodeTextEditorScope() { return useContext(Scope); }

/** The display surface participates in node dragging; only editing blocks it. */
export function NodeTextEditor({ children, label, disabled = false, className }: {
  children: (editing: boolean) => ReactNode; label: string; disabled?: boolean; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const activate = () => {
    if (disabled) return;
    setEditing(true);
    requestAnimationFrame(() => {
      if (root.current?.dataset.editing === "true") root.current.querySelector<HTMLElement>("textarea, [data-app-prompt-editor]")?.focus();
    });
  };
  return <div ref={root} data-node-text-editor="" data-editing={editing && !disabled}
    className={cn("relative min-h-0 min-w-0 rounded-lg border border-neutral-700 bg-neutral-900/60 text-neutral-100 focus-within:border-blue-500/60", className,
      editing && !disabled && "nodrag nopan nowheel")}
    onFocusCapture={event => {
      if (!event.currentTarget.contains(event.target)) return;
      if (event.target !== event.currentTarget.querySelector("[data-node-text-display]") && !disabled) setEditing(true);
    }}
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false);
    }}
    onKeyDownCapture={event => {
      // Portalled preset dialogs keep their own Escape/focus handling.
      if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
      if (event.key !== "Escape" || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault(); event.stopPropagation(); setEditing(false);
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[data-node-text-display]")?.focus());
    }}>
    {children(editing && !disabled)}
    {!editing || disabled ? <div data-node-text-display="" role="button" aria-label={label} aria-disabled={disabled || undefined}
      tabIndex={0} className="absolute inset-0 cursor-grab rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      onPointerDown={event => { pointer.current = { x: event.clientX, y: event.clientY }; }}
      onClick={event => {
        if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 4) return;
        event.stopPropagation(); activate();
      }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); activate(); }
      }} /> : null}
  </div>;
}
