import { findNodeDefinition } from "./node-registry";

export type MediaOutputBinding = { portId: string; sortOrder: number; assetId: string | null };

export function mediaOutputPorts(kind: string) {
  return findNodeDefinition(kind)?.ports.filter(port =>
    port.direction === "output" && ["image", "video", "audio"].includes(port.valueType),
  ) ?? [];
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
