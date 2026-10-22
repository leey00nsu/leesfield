"use client";

/* Group geometry, controls and colors adapted from Node Banana GroupsOverlay.
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

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import type { CanonicalGroup } from "@/shared/generation-graph/canonical-graph";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { spaceGroupColors } from "../model/space-editor-groups";
import type { SpaceEditorSession } from "../model/space-editor-store";
import styles from "./space-editor-tools.module.css";

const colors: Record<CanonicalGroup["color"], { frame: string; preview: string; label: string }> = {
  neutral: { frame: "#262626", preview: "#525252", label: "Gray" },
  blue: { frame: "#1e3a5f", preview: "#3b82f6", label: "Blue" },
  green: { frame: "#1a3d2e", preview: "#22c55e", label: "Green" },
  purple: { frame: "#2d2458", preview: "#8b5cf6", label: "Purple" },
  orange: { frame: "#3d2a1a", preview: "#f97316", label: "Orange" },
  red: { frame: "#3d1a1a", preview: "#ef4444", label: "Red" },
};
const directions = ["nw", "ne", "sw", "se", "n", "s", "w", "e"] as const;
type Direction = typeof directions[number];
type Bounds = CanonicalGroup["bounds"];

export interface SpaceGroupProps {
  /** Graph coordinates, including the parent's transient gesture bounds. */
  group: CanonicalGroup;
  session: SpaceEditorSession;
  zoom: number;
  selected?: boolean;
  onSelect?: () => void;
}

function resizeBounds(bounds: Bounds, direction: Direction, x: number, y: number): Bounds {
  const next = { ...bounds };
  if (direction.includes("e")) next.width = Math.max(200, bounds.width + x);
  if (direction.includes("s")) next.height = Math.max(100, bounds.height + y);
  if (direction.includes("w")) {
    const delta = Math.min(x, bounds.width - 200);
    next.width -= delta; next.x += delta;
  }
  if (direction.includes("n")) {
    const delta = Math.min(y, bounds.height - 100);
    next.height -= delta; next.y += delta;
  }
  return next;
}

/** Render directly in ViewportPortal: background below nodes, controls above.
 * Locked frames retain move/resize controls. Deleting/ungrouping keeps nodes.
 */
export function SpaceGroup({ group, session, zoom, selected = false, onSelect }: SpaceGroupProps) {
  const tc = useCanvasTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [preview, setPreview] = useState<Bounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const backgroundButtonRef = useRef<HTMLButtonElement>(null);
  const titleFocusRef = useRef(false);
  const composingRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const writable = session.getSnapshot().writable;
  const interactive = writable && zoom >= 0.15;
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const bounds = preview ?? group.bounds;
  const frameColor = colors[group.color].frame;

  useEffect(() => () => cancelRef.current?.(), [session, group.id]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus(); inputRef.current?.select();
    } else if (titleFocusRef.current) {
      titleFocusRef.current = false; titleRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false); setColorOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false); setColorOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  };
  const removeFrame = () => {
    session.dispatch({ type: "group.delete", groupId: group.id });
    closeMenu();
  };
  const editTitle = () => {
    if (!interactive) return;
    setName(session.getDocument().groups.find(({ id }) => id === group.id)?.title ?? group.title);
    setEditing(true);
  };
  const finishTitle = (save: boolean) => {
    const title = name.trim();
    if (save && title && title !== session.getDocument().groups.find(({ id }) => id === group.id)?.title) {
      session.dispatch({ type: "group.update", groupId: group.id, patch: { title } });
    }
    titleFocusRef.current = true; setEditing(false);
  };

  const startGesture = (event: PointerEvent<HTMLElement>, direction?: Direction) => {
    if (event.button !== 0 || event.isPrimary === false || cancelRef.current) return;
    if (!direction && (event.target as Element).closest("button, input")) return;
    event.stopPropagation();
    const current = session.getDocument().groups.find(({ id }) => id === group.id);
    if (!interactive || !session.getSnapshot().writable || !current) return;
    event.preventDefault();
    onSelect?.();
    const kind = direction ? "group.resize" : "group.move";
    if (!session.beginGesture({ kind, groupId: group.id }).ok) return;
    // Install listeners synchronously so a move/up in this event turn is kept.
    const initial = { ...current.bounds }, startX = event.clientX, startY = event.clientY;
    const pointerId = event.pointerId;
    const gestureTarget = (event.target instanceof Element ? event.target.closest<HTMLElement>("[data-space-group-geometry]") : null) ?? event.currentTarget;
    gestureTarget.setPointerCapture?.(pointerId);
    let finished = false;
    setDragging(!direction);

    const update = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const latest = session.getDocument().groups.find(({ id }) => id === group.id);
      const gesture = session.getSnapshot().gesture;
      if (!session.getSnapshot().writable || !latest
        || gesture?.kind !== kind || gesture.groupId !== group.id) { finish(false); return; }
      const x = (next.clientX - startX) / scale, y = (next.clientY - startY) / scale;
      if (direction) {
        const resized = resizeBounds(initial, direction, x, y);
        session.updateGesture({ bounds: resized }); setPreview(resized);
      } else {
        const delta = Math.abs(x) > 2 || Math.abs(y) > 2 ? { x, y } : { x: 0, y: 0 };
        session.updateGesture({ delta });
        setPreview({ ...initial, x: initial.x + delta.x, y: initial.y + delta.y });
      }
    };
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      const gesture = session.getSnapshot().gesture;
      if (gesture?.kind === kind && gesture.groupId === group.id) {
        if (commit) session.commitGesture(); else session.cancelGesture();
      }
      cancelRef.current = null; setPreview(null); setDragging(false);
      // On pointerup the browser releases capture itself, keeping the click
      // on this control rather than deselecting the group through the pane.
      if (!commit && gestureTarget.hasPointerCapture?.(pointerId)) gestureTarget.releasePointerCapture(pointerId);
    };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      update(next); finish(true);
    };
    const cancel = () => finish(false);
    const escape = (next: globalThis.KeyboardEvent) => {
      if (next.isComposing || next.keyCode === 229 || next.key !== "Escape") return;
      next.preventDefault(); next.stopPropagation(); cancel(); titleRef.current?.focus({ preventScroll: true });
    };
    cancelRef.current = cancel;
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
  };

  const keyboardGeometry = (event: KeyboardEvent, direction?: Direction) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composingRef.current) return;
    if (event.altKey || event.ctrlKey || event.metaKey || !event.key.startsWith("Arrow")) return;
    const current = session.getDocument().groups.find(({ id }) => id === group.id);
    if (!interactive || !current) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const x = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const y = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    if (!session.beginGesture({ kind: direction ? "group.resize" : "group.move", groupId: group.id }).ok) return;
    session.updateGesture(direction ? { bounds: resizeBounds(current.bounds, direction, x, y) } : { delta: { x, y } });
    session.commitGesture();
    onSelect?.();
  };

  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown" || event.key === "Tab" && !event.shiftKey) next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp" || event.key === "Tab") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[next]?.focus();
  };

  const frameStyle: CSSProperties = { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height };
  return <>
    <div className={styles.groupBackground} data-space-group-background={group.id} data-selected={selected}
      style={{ ...frameStyle, borderColor: frameColor, backgroundColor: `${frameColor}60` }} />
    <div className={`${styles.groupControls} nodrag nopan`} data-space-group={group.id} style={frameStyle}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}>
      <div ref={headerRef} className={styles.groupHeader} data-locked={group.locked} data-dragging={dragging}
        style={{ transform: `scale(${1 / scale})`, pointerEvents: interactive ? "auto" : "none", cursor: interactive ? dragging ? "grabbing" : "grab" : undefined }}
        onPointerDown={startGesture}>
        <div className={styles.groupTitle} style={{ backgroundColor: frameColor }}>
          {group.locked && <LockIcon />}
          {editing && interactive ? <input ref={inputRef} className={styles.groupInput} value={name} maxLength={120}
            aria-label={tc("Group name")} style={{ width: Math.max(60, name.length * 7) }}
            onChange={event => setName(event.target.value)} onBlur={() => finishTitle(true)}
            onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={event => {
              event.stopPropagation();
              if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); finishTitle(event.key === "Enter"); }
            }} /> : <span ref={titleRef} className={styles.groupName} role="button" data-space-group-geometry="" tabIndex={interactive ? 0 : -1}
              aria-label={group.title} aria-disabled={!interactive} onDoubleClick={editTitle}
              onClick={onSelect} onKeyDown={event => {
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); editTitle(); }
                else if (event.key === " ") { event.preventDefault(); onSelect?.(); }
                else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); if (interactive) removeFrame(); }
                else keyboardGeometry(event);
              }}>{group.title}</span>}
        </div>
        {interactive && <div className={styles.groupMenuAnchor}>
          <button ref={menuButtonRef} type="button" className={styles.groupOptions} aria-label={tc("Group options")}
            title={tc("Group options")} aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => { setMenuOpen(!menuOpen); setColorOpen(false); }}>
            <i /><i /><i />
          </button>
          {menuOpen && <div ref={menuRef} role="menu" aria-label={tc("Group options")} className={styles.groupMenu}
            data-space-group-menu="" onKeyDown={menuKeys}>
            {colorOpen && <div role="group" aria-label={tc("Background")} className={styles.colorFan}>
              {spaceGroupColors.map((color, index) => {
                const radians = (-220 + index * 36) * Math.PI / 180;
                return <button key={color} type="button" role="menuitemradio" className={styles.colorOption}
                  aria-label={tc(colors[color].label)} title={tc(colors[color].label)} aria-checked={group.color === color}
                  style={{ left: Math.cos(radians) * 55 - 12, top: Math.sin(radians) * 55 - 12, backgroundColor: colors[color].preview, animationDelay: `${index * 25}ms` }}
                  onClick={() => { session.dispatch({ type: "group.update", groupId: group.id, patch: { color } }); setColorOpen(false); backgroundButtonRef.current?.focus(); }} />;
              })}
            </div>}
            <button ref={backgroundButtonRef} type="button" role="menuitem" className={styles.groupMenuItem} aria-expanded={colorOpen}
              onClick={() => setColorOpen(!colorOpen)}><span className={styles.colorDot} style={{ backgroundColor: frameColor }} />{tc("Background")}</button>
            <button type="button" role="menuitem" className={styles.groupMenuItem} onClick={() => {
              const current = session.getDocument().groups.find(({ id }) => id === group.id);
              if (current) session.dispatch({ type: "group.update", groupId: group.id, patch: { locked: !current.locked } });
              closeMenu();
            }}><LockIcon unlocked={!group.locked} />{tc(group.locked ? "Unlock" : "Lock")}</button>
            <button type="button" role="menuitem" className={styles.groupMenuItem} onClick={removeFrame}>{tc("Ungroup")}</button>
            <button type="button" role="menuitem" className={styles.groupMenuItem} onClick={removeFrame}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M6 18 18 6M6 6l12 12" /></svg>{tc("Delete")}
            </button>
          </div>}
        </div>}
      </div>
      {interactive && directions.map(direction => <button key={direction} type="button"
        className={styles.resizeHandle} data-space-group-geometry="" data-direction={direction} aria-label={`${tc("Resize group")} ${direction.toUpperCase()}`}
        onPointerDown={event => startGesture(event, direction)} onKeyDown={event => keyboardGeometry(event, direction)} />)}
    </div>
  </>;
}

function LockIcon({ unlocked = false }: { unlocked?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={unlocked
      ? "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
      : "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"} />
  </svg>;
}
