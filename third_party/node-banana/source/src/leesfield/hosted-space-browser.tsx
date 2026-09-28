"use client";

import { useCanvasTranslation } from "./localization";

import { useEffect, useRef, useState } from "react";

// Leesfield platform selector; it is not the upstream filesystem browser.
export function HostedSpaceBrowser({ graphs, activeGraphId, onSelectGraph, onClose, onCreateGraph, onDelete, creating, deleting }: {
  graphs: readonly { id: string; title: string }[];
  activeGraphId: string;
  onSelectGraph: (id: string) => void;
  onClose: () => void;
  onCreateGraph?: (title: string) => void;
  onDelete?: () => void;
  creating?: boolean;
  deleting?: boolean;
}) {
  const tc = useCanvasTranslation();
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [title, setTitle] = useState("Untitled Space");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
    (dialogRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]') ?? controls()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === "Tab") {
        const items = controls();
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) controls()[0]?.focus(); };
    window.addEventListener("keydown", key, true); document.addEventListener("focusin", focus);
    return () => { window.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={creatingDraft ? tc("New space") : tc("Spaces")} className="node-banana-space-browser">
      <h2 className="text-xl font-medium text-neutral-100 mb-5">{creatingDraft ? tc("New space") : tc("Spaces")}</h2>
      {creatingDraft ? <form className="node-banana-space-browser__form" onSubmit={(event) => { event.preventDefault(); if (!creating && title.trim()) { onCreateGraph?.(title.trim()); onClose(); } }}>
        <label>{tc("Space name")}<input autoFocus aria-label={tc("Space name")} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <footer><button type="button" onClick={() => setCreatingDraft(false)}>{tc("Cancel")}</button>
        <button type="submit" disabled={creating || !title.trim()}>{tc("Create")}</button></footer>
      </form> : <>
      <div className="node-banana-space-browser__list">
      {graphs.length === 0 && <p>{tc("No spaces available.")}</p>}
      {graphs.map((graph) => <button className="block w-full p-3 text-left rounded hover:bg-neutral-700" key={graph.id} type="button" aria-current={graph.id === activeGraphId ? "page" : undefined} onClick={() => { onSelectGraph(graph.id); onClose(); }}>{graph.title}</button>)}
      </div><footer>
      {onCreateGraph && <button type="button" disabled={creating} onClick={() => setCreatingDraft(true)}>{tc("New space")}</button>}
      {onDelete && <button data-variant="danger" type="button" disabled={deleting} onClick={() => { onClose(); onDelete(); }}>{tc("Delete space")}</button>}
      <button type="button" onClick={onClose}>{tc("Close")}</button></footer>
      </>}
    </section>
  </div>;
}
