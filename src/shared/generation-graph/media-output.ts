import { findNodeDefinition, videoCaptureOutputPortId } from "./node-registry";
import { videoFrameOutputPortIds } from "./video-frame-extraction";
import { isDirectEditPort } from "@/shared/media-assets/direct-media-edit";

export type MediaOutputBinding = { portId: string; sortOrder: number; assetId: string | null };

export function mediaOutputPorts(kind: string) {
  return findNodeDefinition(kind)?.ports.filter(port =>
    port.direction === "output" && port.id !== videoCaptureOutputPortId && !isDirectEditPort(port.id) && ["image", "video", "audio"].includes(port.valueType),
  ) ?? [];
}

/** Execution ports only; canonical ports remain available for saved bindings and wires. */
export function activeMediaOutputPorts(kind: string, config?: unknown) {
  const ports = mediaOutputPorts(kind);
  if (kind !== "edit.video.extractFrames") return ports;
  const activeIds = videoFrameOutputPortIds(config);
  return ports.filter(port => activeIds.some(id => id === port.id));
}

/** Multi-port slots never fall back to another port's representative asset. */
export function mediaAssetIdsForPort(
  kind: string, portId: string, selectedAssetId: string | null,
  bindings: readonly MediaOutputBinding[] = [],
) {
  const ports = mediaOutputPorts(kind);
  const port = ports.find(port => port.id === portId);
  if (!port) return [];
  const outputs = bindings.filter(binding => binding.portId === portId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(binding => binding.assetId ? [binding.assetId] : []);
  if (ports.length > 1) return outputs;
  if (!selectedAssetId) return [];
  return port.valueShape === "ordered-list" && outputs.includes(selectedAssetId)
    ? outputs : [selectedAssetId];
}
