"use client";

import { useCanvasTranslation } from "../leesfield/localization";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSavedComfyNodes, type NodeType } from "../leesfield/upstream-node-host";
import { ALL_NODE_OPTIONS, optionKey, savedComfyOptions } from "./ConnectionDropMenu";

export type NodeSearchMenuHostedOption = {
  type: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  /** Opaque host value returned unchanged to the host callback. */
  value?: unknown;
};

export type NodeSearchMenuHostedProps = {
  hostedOptions: readonly NodeSearchMenuHostedOption[];
  onHostedSelect: (option: NodeSearchMenuHostedOption) => void;
  hostedAriaLabel?: string;
  hostedSearchLabel?: string;
  hostedCloseLabel?: string;
};

interface NodeSearchMenuProps {
  /** Screen position (clientX/clientY) where the menu should anchor. */
  position: { x: number; y: number };
  /** `savedNodeId` is set when the pick is a saved Comfy node. */
  onSelect: (type: NodeType, savedNodeId?: string) => void;
  onClose: () => void;
  /** Explicit hosted inventory; omitting this keeps the standalone library-backed menu. */
  hosted?: NodeSearchMenuHostedProps;
}

const MENU_WIDTH = 224; // matches w-56
const MENU_MAX_HEIGHT = 336; // header + max-h-64 list + footer, approx

/**
 * Searchable list of every addable node type, shown when the user double-clicks
 * the empty canvas. Styled to match ConnectionDropMenu (the handle-drag menu).
 */
function StandaloneNodeSearchMenu({ position, onSelect, onClose }: NodeSearchMenuProps) {
  const tc = useCanvasTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Last real cursor position, used to ignore hover events that fire when the
  // list scrolls under a stationary cursor during keyboard navigation.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const savedNodes = useSavedComfyNodes();

  // Saved nodes sit after the built-ins under their own heading rather than
  // being sorted in among them: the built-in list has a shape people learn, and
  // it should not shuffle every time a workflow is saved.
  const options = useMemo(
    () => [...ALL_NODE_OPTIONS, ...savedComfyOptions(savedNodes)],
    [savedNodes]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (option) =>
        (option.label + " " + tc(option.label)).toLowerCase().includes(query) ||
        option.type.toLowerCase().includes(query)
    );
  }, [search, options, tc]);

  // Reset the highlight to the top whenever the filtered list changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Focus the search box on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted item scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  // Close when clicking outside the menu.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Keep wheel scrolling contained to the menu. React Flow's wheel handler runs
  // on a wrapper listener that fires before React's synthetic onWheel, so stopping
  // propagation here (natively) prevents the canvas from panning/zooming when the
  // list is scrolled — including overscroll once it hits its top/bottom boundary.
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener("wheel", stop, { passive: true });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length ? (prev + 1) % filtered.length : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[selectedIndex];
      if (option) onSelect(option.type as NodeType, option.savedNodeId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Clamp to the viewport so an edge double-click doesn't push the menu off-screen.
  const viewportW = typeof window !== "undefined" ? window.innerWidth : Infinity;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : Infinity;
  const left = Math.max(8, Math.min(position.x, viewportW - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(position.y, viewportH - MENU_MAX_HEIGHT - 8));

  return (
    <div
      ref={menuRef}
      className="fixed z-100 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden w-56 outline-none"
      style={{ left, top }}
    >
      <div className="px-2 py-1.5 border-b border-neutral-700">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tc("Search nodes…")}
          className="w-full bg-transparent text-[11px] text-neutral-100 placeholder-neutral-500 outline-none"
          aria-label={tc("Search nodes")}
        />
      </div>
      <div ref={listRef} className="py-1 max-h-64 overflow-y-auto overscroll-contain nowheel">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-neutral-500">{tc("No matching nodes")}</div>
        ) : (
          filtered.map((option, index) => (
            <Fragment key={optionKey(option)}>
              {/* Once, above the first of them — the built-ins above are a
                  fixed set, these are the user's own. */}
              {option.savedNodeId && !filtered[index - 1]?.savedNodeId && (
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wide text-neutral-500">{tc("Saved nodes")}</div>
              )}
            <button
              data-index={index}
              onClick={() => onSelect(option.type as NodeType, option.savedNodeId)}
              onMouseMove={(e) => {
                // Only re-select on genuine cursor movement. When keyboard nav
                // scrolls the list under a stationary cursor, the browser may
                // fire hover events with unchanged coordinates — ignore those so
                // the arrow-key selection isn't yanked back to the cursor.
                const last = lastPointerRef.current;
                if (last && last.x === e.clientX && last.y === e.clientY) return;
                lastPointerRef.current = { x: e.clientX, y: e.clientY };
                setSelectedIndex(index);
              }}
              className={`w-full px-3 py-2 text-left text-[11px] font-medium flex items-center gap-2 transition-colors ${
                index === selectedIndex
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
              }`}
            >
              {option.icon}
              {/* min-w-0, or a long saved-node name pushes the menu wider
                  instead of ellipsing. */}
              <span className="min-w-0 truncate">{tc(option.label)}</span>
            </button>
            </Fragment>
          ))
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-neutral-700 flex items-center justify-between">
        <span className="text-[9px] text-neutral-500">
          <kbd className="px-1 py-0.5 bg-neutral-700 rounded text-[8px]">↑↓</kbd>{" "}{tc("navigate")}</span>
        <span className="text-[9px] text-neutral-500">
          <kbd className="px-1 py-0.5 bg-neutral-700 rounded text-[8px]">↵</kbd>{" "}{tc("add")}</span>
      </div>
    </div>
  );
}

function HostedNodeSearchMenu({
  position,
  onClose,
  hostedOptions,
  onHostedSelect,
  hostedAriaLabel = "Add node",
  hostedSearchLabel = "Search nodes",
}: NodeSearchMenuProps & NodeSearchMenuHostedProps) {
  const tc = useCanvasTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return hostedOptions;
    return hostedOptions.filter((option) =>
      `${option.label} ${tc(option.label)} ${option.type} ${option.description ?? ""}`.toLowerCase().includes(query),
    );
  }, [hostedOptions, search, tc]);

  useEffect(() => setSelectedIndex(0), [search, hostedOptions]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);
  useEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const stop = (event: WheelEvent) => event.stopPropagation();
    element.addEventListener("wheel", stop, { passive: true });
    return () => element.removeEventListener("wheel", stop);
  }, []);

  const select = (option: NodeSearchMenuHostedOption) => {
    onHostedSelect(option);
    onClose();
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => filtered.length ? (index + 1) % filtered.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[selectedIndex];
      if (option) select(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const viewportW = typeof window !== "undefined" ? window.innerWidth : Infinity;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : Infinity;
  const left = Math.max(8, Math.min(position.x, viewportW - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(position.y, viewportH - MENU_MAX_HEIGHT - 8));

  return (
    <div
      ref={menuRef}
      className="fixed z-100 w-56 overflow-hidden rounded-lg border border-neutral-600 bg-neutral-800 shadow-xl outline-none node-banana-runtime__menu"
      style={{ position: "fixed", left, top, transform: "none" }}
      role="dialog"
      aria-label={tc(hostedAriaLabel)}
      data-node-banana-component="NodeSearchMenu"
    >
      <div className="border-b border-neutral-700 px-2 py-1.5 node-banana-runtime__menu-header">
        <input
          ref={inputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${tc(hostedSearchLabel)}…`}
          aria-label={tc(hostedSearchLabel)}
          className="w-full bg-transparent text-[11px] text-neutral-100 placeholder-neutral-500 outline-none"
        />
      </div>
      <div ref={listRef} className="max-h-64 overflow-y-auto py-1 overscroll-contain nowheel node-banana-runtime__menu-items">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-neutral-500">{tc("No matching nodes")}</div>
        ) : (
          filtered.map((option, index) => (
            <button
              key={`${option.type}-${index}`}
              type="button"
              role="option"
              data-index={index}
              onClick={() => select(option)}
              onMouseMove={() => setSelectedIndex(index)}
              className={`w-full px-3 py-2 text-left text-[11px] font-medium flex items-center gap-2 transition-colors ${index === selectedIndex ? "bg-neutral-700 text-neutral-100" : "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"}`}
            >
              {option.icon}
              <span className="min-w-0 truncate">{tc(option.label)}</span>
            </button>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-700 px-2 py-1.5">
        <span className="text-[9px] text-neutral-500"><kbd className="rounded bg-neutral-700 px-1 py-0.5 text-[8px]">↑↓</kbd>{tc("navigate")}</span>
        <span className="text-[9px] text-neutral-500"><kbd className="rounded bg-neutral-700 px-1 py-0.5 text-[8px]">↵</kbd>{tc("add")}</span>
      </div>
    </div>
  );
}

export function NodeSearchMenu(props: NodeSearchMenuProps) {
  return props.hosted
    ? <HostedNodeSearchMenu {...props} {...props.hosted} />
    : <StandaloneNodeSearchMenu {...props} />;
}
