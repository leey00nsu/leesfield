import type { Edge, Node } from "@xyflow/react";

import type { ImageGenerationNodeConfigDto } from "./graph-types";

export type ImageGenerationNodeData = {
  configVersion: 1;
  config: ImageGenerationNodeConfigDto;
  selectedOutputImageId: string | null;
};

export type ImageGenerationFlowNode = Node<ImageGenerationNodeData, "imageGeneration">;

export type GenerationGraphEdgeData = { kind: "primary" | "reference" };

export type GenerationGraphFlowEdge = Edge<GenerationGraphEdgeData>;
