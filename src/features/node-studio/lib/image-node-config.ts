import type { GenerationGraphFlowEdge, ImageGenerationFlowNode } from "../model/flow-types";
import type { ImageGenerationNodeConfigDto, JsonValue } from "../model/graph-types";

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    );
  }
  return value;
}

export function cloneImageNodeConfig(
  config: ImageGenerationNodeConfigDto,
): ImageGenerationNodeConfigDto {
  return {
    prompt: config.prompt,
    modelKey: config.modelKey,
    parameters: Object.fromEntries(
      Object.entries(config.parameters).map(([key, value]) => [
        key,
        cloneJsonValue(value),
      ]),
    ),
  };
}

export function replaceImageNodeConfig(
  nodes: ImageGenerationFlowNode[],
  nodeId: string,
  config: ImageGenerationNodeConfigDto,
) {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id !== nodeId) return node;
    changed = true;
    return {
      ...node,
      data: { ...node.data, config: cloneImageNodeConfig(config) },
    };
  });
  return changed ? next : nodes;
}

export function replaceImageNodeSelectedOutput(
  nodes: ImageGenerationFlowNode[],
  nodeId: string,
  selectedOutputImageId: string | null,
) {
  let changed = false;
  const next = nodes.map((node) => {
    if (
      node.id !== nodeId ||
      node.data.selectedOutputImageId === selectedOutputImageId
    ) {
      return node;
    }
    changed = true;
    return {
      ...node,
      data: { ...node.data, selectedOutputImageId },
    };
  });
  return changed ? next : nodes;
}

export function duplicateImageNode(
  nodes: ImageGenerationFlowNode[],
  nodeId: string,
  duplicateId: string,
  offset = { x: 48, y: 48 },
) {
  const source = nodes.find((node) => node.id === nodeId);
  if (!source) return nodes;
  const duplicate: ImageGenerationFlowNode = {
    ...source,
    id: duplicateId,
    position: {
      x: source.position.x + offset.x,
      y: source.position.y + offset.y,
    },
    selected: true,
    data: {
      ...source.data,
      config: cloneImageNodeConfig(source.data.config),
      selectedOutputImageId: null,
    },
  };
  return [...nodes.map((node) => ({ ...node, selected: false })), duplicate];
}

export function deleteImageNode(
  nodes: ImageGenerationFlowNode[],
  edges: GenerationGraphFlowEdge[],
  nodeId: string,
) {
  return {
    nodes: nodes.filter((node) => node.id !== nodeId),
    edges: edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ),
  };
}
