import type { NodeTypes } from "@xyflow/react";

import { createImageGenerationFlowNode } from "../lib/graph-adapter";
import { ImageGenerationNode } from "../ui/nodes/image-generation-node";

export const nodeRegistry = {
  imageGeneration: {
    component: ImageGenerationNode,
    create: createImageGenerationFlowNode,
  },
} as const;

export const nodeTypes: NodeTypes = {
  imageGeneration: nodeRegistry.imageGeneration.component,
};
