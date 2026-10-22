"use client";

/* Menu layout and SVG paths adapted from Node Banana NodeSearchMenu,
 * ConnectionDropMenu, FloatingActionBar and the hosted port icons.
 * MIT License — Copyright (c) 2026 William Falloon
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { spaceAuthorableNodeKinds, spaceNodeCatalog } from "../model/space-editor-catalog";
import styles from "./space-editor-tools.module.css";

export interface SpaceNodeMenuProps {
  /** Client/screen coordinates. The menu portals to document.body and clamps to the viewport. */
  position: { x: number; y: number };
  /** The caller supplies compatible kinds for a connection drop. An empty list stays empty. */
  kinds?: readonly CanonicalNodeKind[];
  onChoose: (kind: CanonicalNodeKind) => void;
  onClose: () => void;
  extraActions?: readonly { label: string; onSelect: () => void }[];
  /** Omit to restore the element focused when opening; null disables restoration. */
  returnFocus?: HTMLElement | null;
}

const categories = ["Input", "Text", "Generate", "Process", "Output"] as const;
type Entry = { key: string; label: string; category: string; kind?: CanonicalNodeKind; onSelect?: () => void };

function clampPosition(position: { x: number; y: number }, width = 224, height = 336) {
  if (typeof window === "undefined") return position;
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
  };
}

export function SpaceNodeMenu({ position, kinds, onChoose, onClose, extraActions, returnFocus }: SpaceNodeMenuProps) {
  const tc = useCanvasTranslation();
  const id = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const initialReturnFocusRef = useRef(returnFocus);
  const restoredRef = useRef(false);
  const composingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [location, setLocation] = useState(() => clampPosition(position));
  const { x: positionX, y: positionY } = position;
  const entries = useMemo(() => {
    const allowed = kinds === undefined ? null : new Set(kinds);
    const search = query.trim().toLocaleLowerCase();
    const nodes: Entry[] = categories.flatMap(category => spaceAuthorableNodeKinds
      .filter(kind => spaceNodeCatalog[kind].category === category && (allowed === null || allowed.has(kind)))
      .filter(kind => `${spaceNodeCatalog[kind].paletteLabel} ${spaceNodeCatalog[kind].title} ${tc(spaceNodeCatalog[kind].paletteLabel)} ${kind}`.toLocaleLowerCase().includes(search))
      .map(kind => ({ key: kind, kind, label: spaceNodeCatalog[kind].paletteLabel, category })));
    const actions: Entry[] = (extraActions ?? [])
      .map((action, index) => ({ key: `action-${index}`, label: action.label, onSelect: action.onSelect, category: "Actions" }))
      .filter(action => `${action.label} ${tc(action.label)}`.toLocaleLowerCase().includes(search));
    return [...nodes, ...actions];
  }, [kinds, extraActions, query, tc]);
  const activeIndex = Math.min(selectedIndex, Math.max(0, entries.length - 1));

  const restore = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (restoreRef.current?.isConnected) restoreRef.current.focus({ preventScroll: true });
  }, []);
  const close = useCallback(() => { restore(); onClose(); }, [restore, onClose]);

  useLayoutEffect(() => {
    const target = initialReturnFocusRef.current;
    restoreRef.current = target === undefined
      ? document.activeElement instanceof HTMLElement ? document.activeElement : null
      : target;
    restoredRef.current = false;
    inputRef.current?.focus({ preventScroll: true });
    return restore;
  }, [restore]);

  useLayoutEffect(() => {
    const update = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      const next = clampPosition({ x: positionX, y: positionY }, rect?.width || Math.min(224, window.innerWidth - 16), rect?.height || Math.min(336, window.innerHeight - 16));
      setLocation(previous => previous.x === next.x && previous.y === next.y ? previous : next);
    };
    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (menuRef.current) observer?.observe(menuRef.current);
    return () => { window.removeEventListener("resize", update); observer?.disconnect(); };
  }, [positionX, positionY, entries.length]);

  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [close]);
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, entries.length]);
  useEffect(() => {
    const menu = menuRef.current;
    const stop = (event: WheelEvent) => event.stopPropagation();
    menu?.addEventListener("wheel", stop, { passive: true });
    return () => menu?.removeEventListener("wheel", stop);
  }, []);

  const choose = (entry: Entry) => {
    // Restore before invoking an action that may open its own dialog/focus scope.
    close();
    if (entry.kind) onChoose(entry.kind); else entry.onSelect?.();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") {
      const targets = [...(menuRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? [])];
      const index = targets.indexOf(document.activeElement as HTMLElement);
      const next = (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
      event.preventDefault(); targets[next]?.focus(); return;
    }
    if (event.key === "Enter") { event.preventDefault(); if (entries[activeIndex]) choose(entries[activeIndex]); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    if (event.key === "ArrowDown") next = entries.length ? (activeIndex + 1) % entries.length : 0;
    else if (event.key === "ArrowUp") next = entries.length ? (activeIndex - 1 + entries.length) % entries.length : 0;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = Math.max(0, entries.length - 1);
    else return;
    event.preventDefault(); setSelectedIndex(next);
    if (document.activeElement !== inputRef.current) menuRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div ref={menuRef} className={`${styles.nodeMenu} nodrag nopan nowheel`} role="dialog"
    aria-label={tc("Add node")} style={{ left: location.x, top: location.y }} data-space-node-menu=""
    onKeyDown={handleKeyDown} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div className={styles.menuHeader}>
      <input ref={inputRef} role="combobox" value={query} aria-label={tc("Search nodes")} placeholder={tc("Search nodes…")}
        aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={entries.length ? `${id}-option-${activeIndex}` : undefined}
        onChange={event => { setQuery(event.target.value); setSelectedIndex(0); }}
        onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }} />
    </div>
    <div id={`${id}-list`} role="listbox" aria-label={tc("All nodes")} className={styles.menuItems}>
      {!entries.length && <div role="status" className={styles.empty}>{tc(kinds === undefined ? "No matching nodes" : "No compatible nodes.")}</div>}
      {entries.map((entry, index) => <Fragment key={entry.key}>
        {entry.category !== entries[index - 1]?.category && (entry.category === "Actions"
          ? index > 0 && <div role="separator" className={styles.menuDivider} />
          : <div role="presentation" className={`${styles.category} ${index > 0 ? styles.categoryDivided : ""}`}>{tc(entry.category)}</div>)}
        <button type="button" role="option" id={`${id}-option-${index}`} data-index={index}
          aria-selected={activeIndex === index} tabIndex={activeIndex === index ? 0 : -1} className={styles.menuOption}
          onFocus={() => setSelectedIndex(index)} onClick={() => choose(entry)} onMouseMove={event => {
            const previous = lastPointerRef.current;
            if (previous?.x === event.clientX && previous.y === event.clientY) return;
            lastPointerRef.current = { x: event.clientX, y: event.clientY }; setSelectedIndex(index);
          }}>
          {entry.kind && kinds !== undefined && <MenuIcon type={entry.kind.includes("prompt") || entry.kind.includes("Constructor") ? "text"
            : entry.kind.includes("audio") ? "audio" : entry.kind.includes("video") ? "video" : "image"} />}
          {!entry.kind && entry.label === tc("Upload") && <MenuIcon type="upload" />}
          {!entry.kind && entry.label === tc("Assets") && <MenuIcon type="assets" />}<span>{tc(entry.label)}</span>
        </button>
      </Fragment>)}
    </div>
    <div className={styles.menuFooter}>
      <span><kbd>↑↓</kbd> {tc("navigate")}</span><span><kbd>↵</kbd> {tc("add")}</span>
    </div>
  </div>, document.body);
}

function MenuIcon({ type }: { type: "text" | "audio" | "video" | "image" | "upload" | "assets" }) {
  return <svg className={styles.icon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
    {type === "text" ? <path d="M5 5h14M12 5v14M8 19h8" />
      : type === "audio" ? <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />
        : type === "video" ? <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 9 5-3v12l-5-3" /></>
          : type === "upload" ? <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
            : type === "assets" ? <path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3" />
              : <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>}
  </svg>;
}
