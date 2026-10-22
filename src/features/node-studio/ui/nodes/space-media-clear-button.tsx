"use client";

import { X } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import type { SpaceEditorCommand } from "../../model/space-editor-command-types";
import { useSpaceEditor, useSpaceInputRevision, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import styles from "./space-media-clear-button.module.css";

/** Clears only the displayed media's declared input ports or explicit result selection. */
export function SpaceMediaClearButton({ nodeId, portIds = [], clearOutput = false, label, disabled = false, className }: {
  nodeId: string;
  portIds?: readonly string[];
  clearOutput?: boolean;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable && !state.disposed);
  const revision = useSpaceInputRevision(nodeId), epoch = useSpaceViewSelector(state => state.epoch);
  const incoming = useSpaceSelector(state => state.document.edges.some(edge => edge.targetNodeId === nodeId && portIds.includes(edge.targetPortId)));
  if (!node || (!incoming && !(clearOutput && node.selectedOutputAssetId))) return null;
  const title = label ?? tc("Remove");
  const clear = () => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    if (!state.writable || state.disposed || !current || disabled || current.kind !== node.kind
      || scope.view.getState().epoch !== epoch || scope.inputs.inputRevision(nodeId) !== revision
      || (clearOutput && current.selectedOutputAssetId !== node.selectedOutputAssetId)) return;
    const edges = state.document.edges.filter(edge => edge.targetNodeId === nodeId && portIds.includes(edge.targetPortId));
    const commands: SpaceEditorCommand[] = [];
    if (edges.length) commands.push({ type: "edges.disconnect", edgeIds: edges.map(edge => edge.id) });
    if (clearOutput && current.selectedOutputAssetId) commands.push({ type: "output.clear", nodeId });
    if (!commands.length) return;
    const result = scope.session.dispatch({ type: "batch", commands });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
    return result.ok && result.changed;
  };
  return <button type="button" className={cn(styles.clear, "nodrag nopan", className)} aria-label={title} title={title}
    data-space-media-clear="" disabled={!writable || disabled}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      const body = event.currentTarget.closest<HTMLElement>("[data-space-node-body]");
      if (clear() && body?.isConnected) body.focus({ preventScroll: true });
    }}><X aria-hidden="true" /></button>;
}
