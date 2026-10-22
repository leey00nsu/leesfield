"use client";

/* Toolbar layout, stacking algorithms and SVGs adapted from Node Banana
 * EdgeToolbar, MultiSelectToolbar and FloatingActionBar.
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

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { createPortal } from "react-dom";

import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { findPortDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";

import { isSpaceNodeAuthorable, spaceAuthorableNodeKinds, spaceNodeCatalog } from "../model/space-editor-catalog";
import { alignedSpaceNodePositions } from "../model/space-editor-interactions";
import type { SpaceEditorSession } from "../model/space-editor-store";
import styles from "./space-editor-tools.module.css";

type Position = { x: number; y: number };

export interface SpaceEdgeToolbarProps {
  session: SpaceEditorSession;
  edgeId: string;
  /** Client/screen coordinates at the top center; portals fixed to document.body. */
  position: Position;
}

/** Read the scoped document directly; memoized parents need not rerender us. */
export function SpaceEdgeToolbar({ session, edgeId, position }: SpaceEdgeToolbarProps) {
  const tc = useCanvasTranslation();
  const { document: graph, writable } = useStore(session.store, useShallow(state => ({ document: state.document, writable: state.writable })));
  const edge = graph.edges.find(edge => edge.id === edgeId);
  if (!edge) return null;
  const target = graph.nodes.find(node => node.id === edge.targetNodeId);
  const source = graph.nodes.find(node => node.id === edge.sourceNodeId);
  const pauseAllowed = writable && !isUnavailableEditNodeKind(source?.kind ?? "") && !isUnavailableEditNodeKind(target?.kind ?? "");
  const image = target && findPortDefinition(target.kind, edge.targetPortId, "input")?.valueType === "image";
  const siblings = image ? graph.edges.filter(item => item.targetNodeId === edge.targetNodeId && item.targetPortId === edge.targetPortId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) : [];
  const pauseLabel = tc(edge.hasPause ? "Remove pause" : "Add pause");
  return portal(<div role="toolbar" aria-label={tc("Selected edge")} className={`${styles.toolbar} nodrag nopan`}
    data-space-edge-toolbar="" style={{ left: position.x, top: position.y }}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {siblings.length > 1 && <span className={styles.sequence}>{tc("Image")}{siblings.findIndex(item => item.id === edgeId) + 1}</span>}
    <ToolbarButton className={styles.toolButton} help={pauseLabel} aria-label={pauseLabel}
      data-paused={Boolean(edge.hasPause)} disabled={!pauseAllowed} onClick={() => {
        const current = session.getDocument().edges.find(edge => edge.id === edgeId);
        if (current) session.dispatch({ type: "edge.pause", edgeId, hasPause: !current.hasPause });
      }}><ToolIcon name={edge.hasPause ? "play" : "pause"} /></ToolbarButton>
    <ToolbarButton className={`${styles.toolButton} ${styles.danger}`} help={tc("Delete")} aria-label={tc("Delete edge")}
      disabled={!writable} onClick={() => session.dispatch({ type: "edge.disconnect", edgeId })}><ToolIcon name="delete" /></ToolbarButton>
  </div>);
}

export interface SpaceSelectionToolbarProps {
  session: SpaceEditorSession;
  nodeIds: readonly string[];
  /** Client/screen coordinates at the bottom center, above the node header. */
  position: Position;
  below?: Position;
  onDownload?: () => void;
  downloading?: boolean;
  mediaActions?: ReactNode;
}

function arrangeSelection(session: SpaceEditorSession, nodeIds: readonly string[], layout: "horizontal" | "vertical" | "grid") {
  const ids = new Set(nodeIds), state = session.getSnapshot();
  if (state.document.nodes.filter(node => ids.has(node.id)).length < 2) return;
  const direction = { horizontal: "h", vertical: "v", grid: "g" } as const;
  session.dispatch({ type: "nodes.move", positions: alignedSpaceNodePositions(state, nodeIds, direction[layout]) });
}

/** Selection commands are atomic; arranging requires multiple nodes. */
export function SpaceSelectionToolbar({ session, nodeIds, position, below, onDownload, downloading = false, mediaActions }: SpaceSelectionToolbarProps) {
  const tc = useCanvasTranslation();
  const state = useStore(session.store, useShallow(state => ({ document: state.document, writable: state.writable }))), ids = new Set(nodeIds);
  const selected = state.document.nodes.filter(node => ids.has(node.id));
  const toolbar = useRef<HTMLDivElement>(null), [anchor, setAnchor] = useState(position);
  const belowY = below?.y;
  useLayoutEffect(() => {
    if (!toolbar.current) return;
    const place = () => {
      const bounds = toolbar.current?.getBoundingClientRect();
      if (!bounds) return;
      const headerBottom = document.querySelector('[data-space-workspace-header]')?.getBoundingClientRect().bottom ?? 0;
      const x = Math.max(8 + bounds.width / 2, Math.min(window.innerWidth - 8 - bounds.width / 2, position.x));
      const actionBar = document.querySelector('[data-space-floating-bar]')?.getBoundingClientRect();
      const viewportBottom = actionBar && actionBar.height > 0 ? Math.min(window.innerHeight, actionBar.top) : window.innerHeight;
      const above = position.y - bounds.height, minTop = headerBottom + 8, maxTop = Math.max(minTop, viewportBottom - bounds.height - 8);
      const preferred = Math.max(minTop, Math.min(maxTop, above));
      const obstacles = Array.from(document.querySelectorAll('[data-space-node-header], [data-space-node][data-selected="true"]'), element => element.getBoundingClientRect())
        .filter(rect => rect.width && rect.height && rect.right > x - bounds.width / 2 && rect.left < x + bounds.width / 2);
      const candidates = [preferred, belowY, ...obstacles.flatMap(rect => [rect.top - bounds.height - 8, rect.bottom + 8])];
      const y = candidates.find((value): value is number => value !== undefined && value >= minTop && value <= maxTop
        && obstacles.every(rect => value + bounds.height <= rect.top - 4 || value >= rect.bottom + 4)) ?? preferred;
      setAnchor(previous => previous.x === x && previous.y === y ? previous : { x, y });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(toolbar.current);
    window.addEventListener('resize', place);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); };
  }, [position.x, position.y, belowY, selected.length]);
  if (selected.length === 0) return null;
  const currentIds = selected.map(node => node.id);
  const grouped = state.document.groups.some(group => group.memberNodeIds.some(id => ids.has(id)));
  const disabled = !state.writable;
  const copyDisabled = disabled || selected.some(node => !isSpaceNodeAuthorable(node.kind));
  const shortcuts = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || disabled) return;
    const layout = { h: "horizontal", v: "vertical", g: "grid" } as const;
    const key = event.key.toLowerCase();
    if (Object.hasOwn(layout, key)) { event.preventDefault(); arrangeSelection(session, currentIds, layout[key as keyof typeof layout]); }
  };
  return portal(<div ref={toolbar} role="toolbar" aria-label={tc("Selected nodes")} className={`${styles.toolbar} nodrag nopan`}
    data-space-selection-toolbar="" style={{ left: anchor.x, top: anchor.y }}
    onPointerDown={event => event.stopPropagation()} onKeyDown={shortcuts}>
    <span className={styles.count}>{selected.length} {tc("selected")}</span>
    <ToolbarButton className={styles.toolButton} help={tc("Copy")} disabled={copyDisabled}
      onClick={() => session.dispatch({ type: "nodes.duplicate", nodeIds: currentIds })}>{tc("Copy")}</ToolbarButton>
    <ToolbarButton className={`${styles.toolButton} ${styles.danger}`} help={tc("Delete")} onClick={() => session.dispatch({ type: "nodes.remove", nodeIds: currentIds })} disabled={disabled}>{tc("Delete")}</ToolbarButton>
    <span className={styles.separator} aria-hidden="true" />
    {(["horizontal", "vertical", "grid"] as const).map((layout, index) => {
      const label = tc(["Stack horizontally (H)", "Stack vertically (V)", "Arrange as grid (G)"][index]);
      return <ToolbarButton key={layout} className={styles.toolButton} disabled={disabled || selected.length < 2} aria-label={label} help={label}
        aria-keyshortcuts={["H", "V", "G"][index]} onClick={() => arrangeSelection(session, currentIds, layout)}><ToolIcon name={layout} /></ToolbarButton>;
    })}
    <span className={styles.separator} aria-hidden="true" />
    <ToolbarButton className={styles.toolButton} disabled={disabled} help={tc(grouped ? "Remove from group" : "Create group")}
      aria-label={tc(grouped ? "Remove from group" : "Create group")} onClick={() => session.dispatch(grouped
        ? { type: "group.ungroup", nodeIds: currentIds }
        : { type: "group.create", memberNodeIds: currentIds })}><ToolIcon name={grouped ? "ungroup" : "group"} /></ToolbarButton>
    {mediaActions && <><span className={styles.separator} aria-hidden="true" />{mediaActions}</>}
    {onDownload && <><span className={styles.separator} aria-hidden="true" />
      <ToolbarButton className={styles.toolButton} disabled={disabled || downloading} aria-busy={downloading || undefined}
        help={tc("Download as ZIP")} aria-label={tc("Download as ZIP")} onClick={onDownload}><ToolIcon name="download" /></ToolbarButton></>}
  </div>);
}

export interface SpaceFloatingActionBarProps {
  onAdd: (kind: CanonicalNodeKind) => void;
  /** Client/screen anchor above the bar, suitable for SpaceNodeMenu. */
  onOpenNodes: (position: Position) => void;
  onOpenModels?: (position: Position) => void;
  disabled?: boolean;
  runSelected?: () => void;
  runReady?: boolean;
  selectedNodeCount?: number;
  edgeStyle?: "curved" | "angular";
  onToggleEdgeStyle?: () => void;
}

/** The bottom bar only invokes the explicit single-selected-node run callback. */
export function SpaceFloatingActionBar({ onAdd, onOpenNodes, onOpenModels, disabled = false, runSelected, runReady = false,
  selectedNodeCount = 0, edgeStyle = "curved", onToggleEdgeStyle }: SpaceFloatingActionBarProps) {
  const tc = useCanvasTranslation();
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [generatePosition, setGeneratePosition] = useState<Position | null>(null);
  const generateOpen = !disabled && generatePosition !== null;
  const generateKinds = spaceAuthorableNodeKinds.filter(kind => spaceNodeCatalog[kind].category === "Generate");
  useLayoutEffect(() => {
    if (generateOpen) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [generateOpen]);
  useEffect(() => {
    if (!generateOpen) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !generateButtonRef.current?.contains(event.target)) setGeneratePosition(null);
    };
    const resize = () => setGeneratePosition(null);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss, true);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("focusin", dismiss, true); window.removeEventListener("resize", resize); };
  }, [generateOpen]);

  const add = (kind: CanonicalNodeKind) => { if (!disabled) onAdd(kind); setGeneratePosition(null); };
  const drag = (event: DragEvent, kind: CanonicalNodeKind) => {
    if (disabled) { event.preventDefault(); return; }
    event.dataTransfer.setData("application/leesfield-node-kind", kind);
    event.dataTransfer.effectAllowed = "copy";
    setGeneratePosition(null);
  };
  const anchor = (button: HTMLElement): Position => {
    const rect = button.getBoundingClientRect();
    return { x: rect.left, y: Math.max(8, rect.top - 344) };
  };
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault(); setGeneratePosition(null); generateButtonRef.current?.focus(); return;
    }
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

  const runEnabled = !disabled && Boolean(runSelected) && runReady && selectedNodeCount === 1;
  return portal(<>
    <div role="toolbar" aria-label={tc("Canvas actions")} className={`${styles.floatingBar} nodrag nopan nowheel`}
      data-space-floating-bar="" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {(["input.image", "input.video", "input.prompt"] as const).map((kind, index) => <ToolbarButton key={kind} help={tc(["Image", "Video", "Prompt"][index])}
        className={styles.action} disabled={disabled} onClick={() => add(kind)} draggable={!disabled} onDragStart={event => drag(event, kind)}
        data-tutorial={kind === "input.image" ? "image-button" : kind === "input.prompt" ? "prompt-button" : undefined}>{tc(["Image", "Video", "Prompt"][index])}</ToolbarButton>)}
      <ToolbarButton ref={generateButtonRef} help={tc("Generate")} className={styles.action} disabled={disabled} aria-expanded={generateOpen} aria-haspopup="menu"
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          setGeneratePosition(generateOpen ? null : { x: Math.max(8, Math.min(rect.left, window.innerWidth - 152)), y: window.innerHeight - rect.top + 8 });
        }}>{tc("Generate")}<ToolIcon name="chevron" className={generateOpen ? styles.chevronOpen : undefined} /></ToolbarButton>
      <ToolbarButton help={tc("Output")} className={styles.action} disabled={disabled} onClick={() => add("output.single")} data-tutorial="output-button"
        draggable={!disabled} onDragStart={event => drag(event, "output.single")}>{tc("Output")}</ToolbarButton>
      <ToolbarButton help={tc("All nodes")} className={styles.action} disabled={disabled} aria-haspopup="dialog" data-canvas-action="all-nodes" onClick={event => {
        setGeneratePosition(null); onOpenNodes(anchor(event.currentTarget));
      }}>{tc("All nodes")}<ToolIcon name="chevron" /></ToolbarButton>
      {onOpenModels && <><span className={styles.separator} aria-hidden="true" />
        <ToolbarButton className={styles.action} disabled={disabled} help={tc("Browse models")} onClick={event => {
          setGeneratePosition(null); onOpenModels(anchor(event.currentTarget));
        }}>{tc("All models")}</ToolbarButton></>}
      {onToggleEdgeStyle && <><span className={styles.separator} aria-hidden="true" />
        <ToolbarButton className={styles.iconAction} disabled={disabled} onClick={onToggleEdgeStyle}
          aria-label={tc(edgeStyle === "angular" ? "Switch to curved connectors" : "Switch to angular connectors")}
          help={tc(edgeStyle === "angular" ? "Switch to curved connectors" : "Switch to angular connectors")}><ToolIcon name={edgeStyle} /></ToolbarButton></>}
      <span className={styles.separator} aria-hidden="true" /><div className={styles.runGroup} data-space-run-group="">
        <ToolbarButton disabled={!runEnabled} onClick={() => { if (runEnabled) runSelected?.(); }}
          help={tc(runEnabled ? "Run selected node" : "Select a runnable node first")}><ToolIcon name="play" />{tc("Run")}</ToolbarButton>
      </div>
    </div>
    {generateOpen && generatePosition && <div ref={menuRef} role="menu" aria-label={tc("Generate")} className={`${styles.quickMenu} nodrag nopan nowheel`}
      style={{ left: generatePosition.x, bottom: generatePosition.y }} onKeyDown={menuKeys}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {generateKinds.map(kind => <button key={kind} type="button" role="menuitem" draggable onClick={() => { add(kind); generateButtonRef.current?.focus(); }}
        onDragStart={event => drag(event, kind)}>{tc(spaceNodeCatalog[kind].paletteLabel)}</button>)}
    </div>}
  </>);
}

export function ToolbarButton({ help, disabled, ...props }: ComponentProps<"button"> & { help: string }) {
  const tooltipId = useId(), [open, setOpen] = useState(false);
  const description = [props["aria-describedby"], open ? tooltipId : undefined].filter(Boolean).join(" ") || undefined;
  const button = <button type="button" {...props} disabled={disabled} aria-describedby={description} />;
  return <Tooltip onOpenChange={setOpen}>
    <TooltipTrigger asChild>{disabled
      ? <span className={styles.tooltipTrigger} tabIndex={0} aria-label={props["aria-label"] ?? help} aria-disabled="true" aria-describedby={description}>{button}</span>
      : button}</TooltipTrigger>
    <TooltipContent id={tooltipId} role="tooltip" className={styles.toolbarTooltip}>{help}</TooltipContent>
  </Tooltip>;
}

function portal(content: ReactNode) { return typeof document === "undefined" ? null : createPortal(<TooltipProvider delayDuration={250}>{content}</TooltipProvider>, document.body); }

const paths = {
  play: "M8 5v14l11-7z", pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  delete: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
  horizontal: "M6 4h4v16H6zM14 4h4v16h-4z", vertical: "M4 6h16v4H4zM4 14h16v4H4z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  group: "M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z",
  ungroup: "M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25",
  download: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
  chevron: "m5 15 7-7 7 7",
  angular: "M4 12h4l4-8 4 8h4", curved: "M4 12s4-8 8-8 8 8 8 8",
};
function ToolIcon({ name, className }: { name: keyof typeof paths; className?: string }) {
  const filled = name === "play" || name === "pause";
  return <svg className={`${styles.icon} ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true"
    fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
  </svg>;
}
