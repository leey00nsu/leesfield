import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";
import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import type { AssistantResults } from "@/shared/generation-graph/assistant-output";
import { mediaAssetIdsForPort, mediaOutputPorts, type MediaOutputBinding } from "@/shared/generation-graph/media-output";

import type { NodePromptInputState } from "./node-authoring-context";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function resolveNodePromptInput(
  graph: NodeBananaRuntimeGraph,
  nodeId: string,
  assistantResults: AssistantResults = {},
): NodePromptInputState {
  const edge = graph.edges.find((candidate) => candidate.target === nodeId &&
    ["text", "prompt"].includes(String(candidate.data?.targetPortId ?? candidate.targetHandle)));
  if (!edge) return { connected: false, text: null };
  try {
    return { connected: true, text: resolveGraphText({
      nodes: graph.nodes.map((node) => ({ id: node.id, kind: String(node.data.canonicalKind), config: node.data.config })),
      edges: graph.edges.map((edge) => ({ sourceNodeId: edge.source, sourcePortId: String(edge.data?.sourcePortId ?? edge.sourceHandle ?? "text"), targetNodeId: edge.target,
        targetPortId: String(edge.data?.targetPortId ?? edge.targetHandle), sortOrder: Number(edge.data?.sortOrder ?? 0), hasPause: edge.data?.hasPause === true })),
    }, edge.source, new Set(), assistantResults, String(edge.data?.sourcePortId ?? edge.sourceHandle ?? "text")) };
  } catch { return { connected: true, text: null }; }
}

export function resolveNodeInputAssetId(
  graph: NodeBananaRuntimeGraph,
  nodeId: string,
  targetPortId: string,
) {
  return resolveNodeInputAssetIds(graph, nodeId, targetPortId)[0] ?? null;
}

export function resolveNodeInputAssetIds(
  graph: NodeBananaRuntimeGraph,
  nodeId: string,
  targetPortId: string,
) {
  return resolveInputAssetIds(graph, nodeId, targetPortId, new Set());
}

function passThroughPort(kind: unknown) {
  if (kind === "input.image") return "reference";
  if (kind === "input.audio") return "audio";
  if (kind === "input.video") return "video";
  return null;
}

function resolveInputAssetIds(
  graph: NodeBananaRuntimeGraph,
  nodeId: string,
  targetPortId: string,
  visited: Set<string>,
): string[] {
  const visitKey = `${nodeId}:${targetPortId}`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);
  const edges = graph.edges.filter((candidate) =>
    candidate.target === nodeId &&
    !(targetPortId === "reference" &&
      graph.nodes.find((node) => node.id === nodeId)?.data.canonicalKind === "input.image" &&
      graph.nodes.find((node) => node.id === candidate.source)?.data.canonicalKind === "edit.image.splitGrid") &&
    (candidate.data?.targetPortId === targetPortId || candidate.targetHandle === targetPortId),
  ).sort((left, right) => Number(left.data?.sortOrder ?? 0) - Number(right.data?.sortOrder ?? 0));
  return edges.flatMap((edge) => {
    const source = graph.nodes.find((candidate) => candidate.id === edge.source);
    if (!source) return [];
    const config = record(source.data.config);
    if (config.resultSource && ["input.image", "input.audio", "input.video"].includes(String(source.data.canonicalKind))) return typeof config.assetId === "string" ? [config.assetId] : [];
    const sourcePassThroughPort = passThroughPort(source.data.canonicalKind);
    if (sourcePassThroughPort) {
      const hasUpstream = graph.edges.some((candidate) =>
        candidate.target === source.id &&
        !(source.data.canonicalKind === "input.image" &&
          graph.nodes.find((node) => node.id === candidate.source)?.data.canonicalKind === "edit.image.splitGrid") &&
        (candidate.data?.targetPortId === sourcePassThroughPort || candidate.targetHandle === sourcePassThroughPort),
      );
      const upstream = resolveInputAssetIds(graph, source.id, sourcePassThroughPort, new Set(visited));
      if (hasUpstream) return upstream;
    }
    if (!sourcePassThroughPort && mediaOutputPorts(String(source.data.canonicalKind)).length > 1) return mediaAssetIdsForPort(String(source.data.canonicalKind),
      String(edge.data?.sourcePortId ?? edge.sourceHandle),
      typeof source.data.selectedOutputAssetId === "string" ? source.data.selectedOutputAssetId : null,
      Array.isArray(source.data.outputBindings) ? source.data.outputBindings as MediaOutputBinding[] : []);
    if (typeof source.data.selectedOutputAssetId === "string") return [source.data.selectedOutputAssetId];
    const assetId = record(source.data.config).assetId;
    return typeof assetId === "string" ? [assetId] : [];
  });
}
