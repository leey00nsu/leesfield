"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NodeResizer } from "@xyflow/react";
import { cn } from "@/shared/lib/utils";
import { spaceFlowId } from "../../model/space-editor-flow";
import styles from "./space-node-frame.module.css";

type ResizeSize = { width: number; height: number; x?: number; y?: number };
function resizeSize(size: ResizeSize): ResizeSize {
  return { width: size.width, height: size.height,
    ...(Number.isFinite(size.x) ? { x: size.x } : {}), ...(Number.isFinite(size.y) ? { y: size.y } : {}) };
}

export interface SpaceNodeShellProps {
  id: string;
  kind: string;
  selected?: boolean;
  writable?: boolean;
  executing?: boolean;
  hasError?: boolean;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  fullBleed?: boolean;
  children: ReactNode;
  header?: ReactNode;
  /** Status below the node; it never contributes to the body or resize geometry. */
  footer?: ReactNode;
  settingsExpanded?: boolean;
  /** The caller supplies its collapsed Settings toggle as well as expanded content. */
  settingsPanel?: ReactNode;
  /** Media height, excluding the measured settings panel. Owned by the caller. */
  bodyHeight?: number;
  onResizeStart?: () => void;
  onResizeCancel?: () => void;
  onResize?: (size: ResizeSize, finished: boolean) => void;
  onPanelHeightChange?: (height: number) => void;
  onHover?: (hover: boolean) => void;
  onAspectFit?: () => void;
  /** Native canvas bodies enter control mode only after a click without dragging. */
  onBodyInteract?: () => void;
  bodyInteractionAllowed?: boolean;
}

/** The Flow node supplies the total size; this component never writes graph state. */
export function SpaceNodeShell({
  id, kind, selected = false, writable = true, executing = false, hasError = false,
  minWidth = 180, minHeight = 100, className, style, contentClassName, fullBleed = false,
  children, header, footer, settingsExpanded = false, settingsPanel, bodyHeight,
  onResizeStart, onResizeCancel, onResize, onPanelHeightChange, onHover, onAspectFit,
  onBodyInteract, bodyInteractionAllowed = true,
}: SpaceNodeShellProps) {
  const [interaction, setInteraction] = useState({ id, selected, allowed: bodyInteractionAllowed, active: false });
  if (interaction.id !== id || interaction.selected !== selected || interaction.allowed !== bodyInteractionAllowed) {
    setInteraction({ id, selected, allowed: bodyInteractionAllowed,
      active: interaction.id === id && selected && bodyInteractionAllowed && interaction.active });
  }
  const setInteracting = (active: boolean) => setInteraction(previous => previous.active === active ? previous : { ...previous, active });
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const composing = useRef(false);
  const interactive = !onBodyInteract || selected && interaction.active && bodyInteractionAllowed;
  const panel = useRef<HTMLDivElement>(null);
  const reportPanelHeight = useRef(onPanelHeightChange);
  const lastPanelHeight = useRef<number | null>(null);
  const resizePhase = useRef<"idle" | "active" | "cancelled">("idle");
  const cancelCallback = useRef(onResizeCancel);
  const expanded = settingsExpanded && settingsPanel != null;

  const ownedTarget = (target: EventTarget, root: HTMLElement) => target instanceof Element && root.contains(target)
    && !target.closest('[data-space-port], .react-flow__resize-control');
  const bodyTarget = (target: EventTarget, root: HTMLElement) => ownedTarget(target, root)
    && target instanceof Element && Boolean(target.closest('[data-space-node-body], [data-space-node-settings]'));
  const trackPointer = (x: number, y: number) => {
    if (pointer.current && Math.hypot(x - pointer.current.x, y - pointer.current.y) > 4) pointer.current.moved = true;
  };
  const activateBody = () => { setInteracting(true); onBodyInteract?.(); };

  useLayoutEffect(() => { reportPanelHeight.current = onPanelHeightChange; }, [onPanelHeightChange]);
  useLayoutEffect(() => { cancelCallback.current = onResizeCancel; }, [onResizeCancel]);
  useLayoutEffect(() => {
    if (!writable && resizePhase.current === "active") {
      resizePhase.current = "cancelled";
      cancelCallback.current?.();
    }
  }, [writable]);
  useLayoutEffect(() => () => {
    if (resizePhase.current === "active") cancelCallback.current?.();
    resizePhase.current = "idle";
  }, [id]);
  useLayoutEffect(() => {
    const report = (height: number) => {
      if (!Number.isFinite(height) || height < 0 || height === lastPanelHeight.current) return;
      lastPanelHeight.current = height;
      reportPanelHeight.current?.(height);
    };
    if (!expanded || !panel.current) {
      report(0);
      return;
    }
    const element = panel.current;
    let active = true;
    // Flow zoom transforms the DOM rect; offsetHeight stays in node coordinates.
    report(element.offsetHeight);
    const observer = new ResizeObserver(([entry]) => {
      if (!active || !entry) return;
      // Border-box height is the space the panel actually occupies in the shell.
      report(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [expanded, id]);

  return <div
    className={cn(styles.shell, className)}
    style={style}
    data-space-node={kind}
    data-space-node-id={id}
    data-node-id={id}
    data-selected={selected}
    data-writable={writable}
    data-executing={executing}
    data-error={hasError}
    data-full-bleed={fullBleed}
    data-settings-expanded={expanded}
    data-body-interactive={interactive}
    onCompositionStartCapture={event => { if (bodyTarget(event.target, event.currentTarget)) composing.current = true; }}
    onCompositionEndCapture={event => { if (bodyTarget(event.target, event.currentTarget)) composing.current = false; }}
    onPointerDownCapture={event => {
      pointer.current = onBodyInteract && ownedTarget(event.target, event.currentTarget) && event.button === 0
        ? { x: event.clientX, y: event.clientY, moved: false } : null;
    }}
    onPointerMoveCapture={event => trackPointer(event.clientX, event.clientY)}
    onPointerUpCapture={event => trackPointer(event.clientX, event.clientY)}
    onClickCapture={event => {
      if (!onBodyInteract || !ownedTarget(event.target, event.currentTarget) || event.button !== 0) return;
      const start = pointer.current;
      pointer.current = null;
      if (start && (start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4)) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (bodyTarget(event.target, event.currentTarget) && !interactive) {
        event.preventDefault(); event.stopPropagation(); activateBody();
      } else if (event.target instanceof Element && event.target.closest('[data-space-node-header]')) activateBody();
    }}
    onFocusCapture={event => {
      if (!interactive && bodyTarget(event.target, event.currentTarget) && event.target instanceof Element
        && !event.target.matches('[data-node-text-display], [data-space-node-body]')) {
        pointer.current = null;
        activateBody();
      }
    }}
    onKeyDownCapture={event => {
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') pointer.current = null;
      if (!onBodyInteract || !bodyTarget(event.target, event.currentTarget) || event.key !== 'Escape'
        || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      const root = event.currentTarget, native = event.nativeEvent;
      // Suggestions and editors own the first Escape. Wait for their handler
      // before exiting the node; blurring during capture would close them early.
      queueMicrotask(() => {
        if (!root.isConnected || native.defaultPrevented) return;
        setInteracting(false);
        root.querySelector<HTMLElement>('[data-space-node-body]')?.focus({ preventScroll: true });
      });
    }}
    onMouseEnter={event => { if (event.buttons === 0) onHover?.(true); }}
    onMouseLeave={() => onHover?.(false)}
    onPointerCancelCapture={() => {
      if (pointer.current) pointer.current.moved = true;
      if (resizePhase.current !== "active") return;
      resizePhase.current = "cancelled";
      cancelCallback.current?.();
    }}
    onDoubleClick={event => {
      if (!writable || !onAspectFit || !(event.target instanceof Element)
        || !event.target.closest(".react-flow__resize-control")) return;
      event.stopPropagation();
      onAspectFit();
    }}
  >
    <NodeResizer nodeId={spaceFlowId(id)} isVisible={selected && writable} autoScale={false}
      minWidth={minWidth} minHeight={minHeight}
      lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle}
      onResizeStart={() => { if (writable) { resizePhase.current = "active"; onResizeStart?.(); } }}
      onResize={(_event, size) => { if (writable && resizePhase.current !== "cancelled") { resizePhase.current = "active"; onResize?.(resizeSize(size), false); } }}
      onResizeEnd={(_event, size) => {
        if (!writable || resizePhase.current === "cancelled") return;
        resizePhase.current = "idle";
        onResize?.(resizeSize(size), true);
      }} />
    {header}
    <div className={styles.body}
      data-space-node-body=""
      tabIndex={onBodyInteract ? -1 : undefined}
      style={bodyHeight === undefined ? undefined : { height: bodyHeight, flex: "none" }}>
      <div className={cn(styles.content, contentClassName)}>{children}</div>
    </div>
    {(settingsPanel != null || footer != null) && <div className={styles.afterBody}>
      {settingsPanel != null && <div ref={panel} className={cn(styles.panel, interactive && "nodrag nopan nowheel")}
        data-space-node-settings="">{settingsPanel}</div>}
      {footer != null && <div className={styles.footer} data-space-node-footer="">{footer}</div>}
    </div>}
  </div>;
}
