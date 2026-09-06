import type { Edge, Node } from "@xyflow/react";

import type { ImageGenerationNodeConfigDto } from "./graph-types";

export type ImageGenerationNodeData = {
  configVersion: 1;
  config: ImageGenerationNodeConfigDto;
  selectedOutputAssetId: string | null;
};

export type ImageGenerationFlowNode = Node<ImageGenerationNodeData, "generationNode">;

export type GenerationGraphEdgeData = {
  sourcePortId?: string;
  targetPortId?: string;
  sortOrder?: number;
};

export type GenerationGraphFlowEdge = Edge<GenerationGraphEdgeData>;
