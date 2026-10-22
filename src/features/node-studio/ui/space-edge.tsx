"use client";

/* Edge visuals adapted from Node Banana EditableEdge and SharedEdgeGradients.
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

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BaseEdge, getBezierPath, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";

import { findNodeDefinition, findPortDefinition, supportsVideoCaptureOutput, videoCaptureOutputPortId } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { useAppReducedMotion } from "@/shared/lib/use-app-reduced-motion";

import { canonicalSpaceId, type SpaceFlowEdge } from "../model/space-editor-flow";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { useSpaceEditor, useSpaceSelector, useSpaceViewSelector } from "./space-editor-provider";
import styles from "./space-edge.module.css";

const colors = {
  image: "#0d9668", text: "#2563eb", video: "#ec4899", audio: "#f97316",
  reference: "#52525b", settings: "#f59e0b", default: "#64748b", pause: "#ea580c",
} as const;
type ColorKey = keyof typeof colors;
type SelectionKey = "active" | "dimmed";

// Encoding every code point keeps arbitrary canonical IDs safe and collision-free
// in SVG fragment references, including IDs containing percent signs or quotes.
function gradientNamespace(sessionId: string) {
  return `space-edge-${Array.from(sessionId, character => character.codePointAt(0)!.toString(16)).join("-")}`;
}
function gradientId(namespace: string, color: ColorKey, selection: SelectionKey) {
  return `${namespace}-${color}-${selection}`;
}
function sourceColor(kind: string | undefined, portId: string | undefined): ColorKey {
  if (!portId) return "default";
  if (portId === "reference" || (kind === "edit.image.splitGrid" && portId === "images")) return "reference";
  const valueType = kind ? findPortDefinition(kind, portId, "output")?.valueType : undefined;
  return valueType && valueType !== "media" ? valueType : "default";
}
function executable(kind: string) {
  const mode = findNodeDefinition(kind)?.executionMode;
  return mode !== undefined && mode !== "none";
}
function activeExecution(execution: NodeExecutionDto | undefined, nodeId: string) {
  return execution?.graphNodeId === nodeId
    && (execution.status === "pending" || execution.status === "processing" || execution.status === "uploading");
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Mount once per Space canvas; edge paint servers inherit these shared stops. */
export function SpaceEdgeGradients() {
  const sessionId = useSpaceSelector(state => state.id);
  const namespace = gradientNamespace(sessionId);
  return <svg className={styles.gradients} aria-hidden="true" focusable="false">
    <defs>{Object.entries(colors).flatMap(([key, color]) => (["active", "dimmed"] as const).map(selection =>
      <linearGradient key={`${key}-${selection}`} id={gradientId(namespace, key as ColorKey, selection)} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={color} stopOpacity={selection === "active" ? 1 : 0.25} />
        <stop offset="50%" stopColor={color} stopOpacity={selection === "active" ? 0.55 : 0.1} />
        <stop offset="100%" stopColor={color} stopOpacity={selection === "active" ? 1 : 0.25} />
      </linearGradient>))}</defs>
  </svg>;
}

export function SpaceEdge(props: EdgeProps<SpaceFlowEdge>) {
  const sessionId = useSpaceSelector(state => state.id);
  const edgeId = props.data?.edgeId ?? canonicalSpaceId(props.id);
  // A new Space or edge gets fresh transient geometry and releases active listeners.
  return <ScopedSpaceEdge key={JSON.stringify([sessionId, edgeId])} {...props} canonicalEdgeId={edgeId} sessionId={sessionId} />;
}

function ScopedSpaceEdge(props: EdgeProps<SpaceFlowEdge> & { canonicalEdgeId: string; sessionId: string }) {
  const scope = useSpaceEditor(), { session } = scope, flow = useReactFlow();
  const tc = useCanvasTranslation();
  const reducedMotion = useAppReducedMotion();
  const edge = useSpaceViewSelector(state => state.edgeById.get(props.canonicalEdgeId));
  const edgeStyle = useSpaceViewSelector(state => state.edgeStyle);
  const sourceId = edge?.sourceNodeId ?? canonicalSpaceId(props.source);
  const targetId = edge?.targetNodeId ?? canonicalSpaceId(props.target);
  const sourceKind = useSpaceSelector(state => state.nodeById.get(sourceId)?.kind);
  const connectedToSelection = useSpaceSelector(state => state.selectedNodeIds.includes(sourceId) || state.selectedNodeIds.includes(targetId));
  // Select only the final boolean: progress and equivalent result-item snapshots
  // must not rerender an edge. Activity never follows a producer's latest asset.
  const running = useSpaceSelector(state => {
    if (!edge || edge.hasPause) return false;
    const source = state.nodeById.get(sourceId), target = state.nodeById.get(targetId);
    if (!source || !target) return false;
    const targetRuntime = state.runtimeByNode.get(targetId);
    // A completed result is still a real input when a new executable consumes it.
    if (executable(target.kind) && (targetRuntime?.submissionPending === true
      || activeExecution(targetRuntime?.execution, targetId))) return true;
    if (!executable(source.kind) && !(supportsVideoCaptureOutput(source.kind) && edge.sourcePortId === videoCaptureOutputPortId)) return false;
    const runtime = state.runtimeByNode.get(sourceId);
    const executionId = activeExecution(runtime?.execution, sourceId) ? runtime?.execution?.executionId : undefined;
    const pendingResult = (value: unknown, reservationId: string) => {
      const result = record(value);
      if (result.state !== "pending" || result.nodeId !== sourceId || result.portId !== edge.sourcePortId) return false;
      // Admission can retain the previous terminal execution in runtime. Only a
      // reservation owned by this request proves that an unbound result is new.
      return result.executionId === null
        ? runtime?.submissionPending === true && runtime.resultReservationIds?.includes(reservationId) === true
        : executionId !== undefined && result.executionId === executionId;
    };
    const config = record(target.config);
    if (target.kind === "output.gallery" && Array.isArray(config.resultItems)) {
      return config.resultItems.some(item => {
        const id = record(item).id;
        return typeof id === "string" && pendingResult(item, id);
      });
    }
    return ["input.image", "input.video", "input.audio"].includes(target.kind) && pendingResult(config.resultSource, targetId);
  });
  const writable = useSpaceSelector(state => state.writable && !state.disposed);
  const [offsetX, setOffsetX] = useState(0), [dragging, setDragging] = useState(false);
  const abortDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => { abortDrag.current?.(); }, [scope, edgeStyle, writable, edge]);

  const geometry = {
    sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
    targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
  };
  const [path, handleX, handleY] = edgeStyle === "curved"
    ? getBezierPath({ ...geometry, curvature: 0.25 })
    : getSmoothStepPath({ ...geometry, borderRadius: 8, offset: 0, centerX: (props.sourceX + props.targetX) / 2 + offsetX });
  const colorKey = edge?.hasPause ? "pause" : sourceColor(sourceKind, edge?.sourcePortId);
  const namespace = gradientNamespace(props.sessionId);
  const sharedGradient = gradientId(namespace, colorKey, connectedToSelection ? "active" : "dimmed");
  const paintId = `${namespace}-edge-${Array.from(props.canonicalEdgeId, character => character.codePointAt(0)!.toString(16)).join("-")}`;
  const stroke = `url(#${paintId})`;

  const beginDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    const state = session.getSnapshot();
    if (event.button !== 0 || abortDrag.current || !state.writable || state.disposed
      || !edge || scope.view.getState().edgeStyle !== "angular") return;
    event.preventDefault(); event.stopPropagation();
    const document = event.currentTarget.ownerDocument, window = document.defaultView;
    const pointerId = event.pointerId, startX = event.clientX, startOffset = offsetX;
    const zoom = flow.getZoom();
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const finish = (cancelled: boolean) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", escape, true);
      window?.removeEventListener("blur", cancel);
      abortDrag.current = null;
      if (cancelled) setOffsetX(startOffset);
      setDragging(false);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      next.preventDefault();
      setOffsetX(startOffset + (next.clientX - startX) / scale);
    };
    const release = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(false); };
    const cancel = (next?: Event) => {
      if (next && "pointerId" in next && next.pointerId !== pointerId) return;
      finish(true);
    };
    const escape = (next: KeyboardEvent) => {
      if (next.key !== "Escape" || next.isComposing) return;
      next.preventDefault(); next.stopPropagation(); cancel();
    };
    abortDrag.current = cancel;
    setDragging(true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", escape, true);
    window?.addEventListener("blur", cancel);
  };

  if (!edge) return null;
  return <>
    <defs>
      {/* A horizontal/vertical path has an empty object bounding box. Defining
          the gradient in Flow coordinates keeps it paintable after selection,
          zoom or remeasurement without changing canonical edges or the path. */}
      <linearGradient id={paintId} href={`#${sharedGradient}`} gradientUnits="userSpaceOnUse"
        x1={props.sourceX} y1={props.sourceY} x2={props.targetX} y2={props.targetY} />
    </defs>
    <BaseEdge id={props.id} path={path} markerStart={props.markerStart} markerEnd={props.markerEnd} interactionWidth={15}
      style={{ ...props.style, stroke, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }} />
    {running && <g className={styles.glow} aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" opacity={0.06} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={0.12} />
      <path className={styles.pulse} style={reducedMotion ? { animation: "none" } : undefined}
        d={path} fill="none" stroke={stroke} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="20 30" />
    </g>}
    {edge.hasPause && <g transform={`translate(${props.targetX - 24}, ${props.targetY})`} role="img" aria-label={tc("Paused edge")}>
      <circle r={10} fill="#27272a" stroke={colors.pause} strokeWidth={2} />
      <rect x={-4} y={-5} width={2.5} height={10} fill={colors.pause} rx={1} />
      <rect x={1.5} y={-5} width={2.5} height={10} fill={colors.pause} rx={1} />
    </g>}
    {writable && edgeStyle === "angular" && (props.selected || dragging) && Math.abs(props.targetX - props.sourceX) > 50
      && <circle className={`${styles.handle} nodrag nopan`} data-space-edge-handle="true"
        cx={handleX} cy={handleY} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} onPointerDown={beginDrag} />}
  </>;
}
