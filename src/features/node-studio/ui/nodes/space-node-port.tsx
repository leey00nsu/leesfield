"use client";

import { useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { AudioLines, ImageIcon, Layers, Settings2, Type, Video } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { PortValueType } from "@/shared/generation-graph/node-registry";
import { spaceHandleId } from "../../model/space-editor-ports";
import type { SpacePortReference } from "../../model/space-editor-types";
import styles from "./space-node-frame.module.css";

export interface SpaceNodePortProps {
  reference: SpacePortReference;
  valueType: PortValueType;
  label: string;
  /** Top offset in Flow coordinates; omitted ports are vertically centered. */
  position?: number;
  connectable?: boolean;
  connected?: boolean;
  visible?: boolean;
  anchorPortId?: string;
  onActivate?: (port: SpacePortReference, position: { x: number; y: number }) => void;
}

const icons = { text: Type, image: ImageIcon, audio: AudioLines, video: Video, settings: Settings2, media: Layers };

/** One contact point, including hidden aliases required by saved canonical edges. */
export function SpaceNodePort({
  reference, valueType, label, position, connectable = true, connected = false,
  visible = true, anchorPortId, onActivate,
}: SpaceNodePortProps) {
  const tc = useCanvasTranslation();
  const origin = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const enabled = connectable && visible;
  const Icon = icons[valueType];
  const activate = (element: HTMLDivElement) => {
    if (!enabled) return;
    const rect = element.getBoundingClientRect();
    onActivate?.(reference, { x: rect.right + 8, y: rect.top });
  };
  const trackMovement = (x: number, y: number) => {
    const start = origin.current;
    if (start && Math.hypot(x - start.x, y - start.y) > 4) start.moved = true;
  };

  return <Handle
    id={spaceHandleId(reference)}
    type={reference.direction === "input" ? "target" : "source"}
    position={reference.direction === "input" ? Position.Left : Position.Right}
    className={styles.port}
    data-space-port={reference.portId}
    data-anchor-port-id={anchorPortId ?? reference.portId}
    data-value-type={valueType}
    data-connected={connected}
    data-visible={visible}
    style={{ top: position ?? "50%" }}
    // An invisible alias is still measured by Flow, but never steals the visible contact.
    isConnectable={enabled} isConnectableStart={enabled} isConnectableEnd={enabled}
    role="button" tabIndex={enabled ? 0 : -1}
    aria-hidden={!visible || undefined} aria-disabled={!enabled}
    aria-label={tc(reference.direction === "input" ? "Connect {media} input" : "Connect {media} output").replace("{media}", tc(label))}
    title={tc(label)}
    onPointerDown={event => {
      origin.current = event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : null;
    }}
    onPointerMove={event => trackMovement(event.clientX, event.clientY)}
    onPointerUp={event => trackMovement(event.clientX, event.clientY)}
    onPointerCancel={() => { if (origin.current) origin.current.moved = true; }}
    onClick={event => {
      const start = origin.current;
      origin.current = null;
      if (!enabled) return;
      event.stopPropagation();
      if (start && (start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4)) return;
      activate(event.currentTarget);
    }}
    onKeyDown={event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.stopPropagation();
      if (!enabled || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return;
      event.preventDefault();
      origin.current = null;
      activate(event.currentTarget);
    }}
  ><Icon size={16} strokeWidth={1.7} aria-hidden="true" /></Handle>;
}
