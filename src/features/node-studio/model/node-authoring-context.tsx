"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";

import type { ImageGenerationNodeConfigDto } from "./graph-types";
import type { ImageNodeInputReadiness } from "./node-input-readiness";
import type { NodeRunReadiness } from "./node-run-readiness";

export type NodeAuthoringCatalogState = {
  imageModels: readonly RuntimeImageModel[];
  videoModels?: readonly RuntimeVideoModel[];
  audioModels?: readonly RuntimeAudioModel[];
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  refresh?: () => Promise<void>;
  backgroundRemovalAvailable?: boolean;
};

export type NodePromptInputState = {
  connected: boolean;
  text: string | null;
};

type NodeAuthoringContextValue = NodeAuthoringCatalogState & {
  graphId: string;
  prepareImageNodeExecution: () => Promise<number>;
  prepareNodeExecution?: () => Promise<number>;
  writable?: boolean;
  updateCanonicalNodeConfig?: (nodeId: string, config: CanonicalJsonValue) => void;
  getImageNodeInputReadiness: (nodeId: string) => ImageNodeInputReadiness;
  getNodeRunReadiness?: (nodeId: string) => NodeRunReadiness;
  getNodePromptInput?: (nodeId: string) => NodePromptInputState;
  getNodeInputAssetId?: (nodeId: string, targetPortId: string) => string | null;
  getNodeInputAssetIds?: (nodeId: string, targetPortId: string) => string[];
  isNodePortConnected?: (nodeId: string, targetPortId: string) => boolean;
  isNodePersisted?: (nodeId: string) => boolean;
  selectNodeOutputAsset?: (nodeId: string, assetId: string | null) => void;
  updateImageNodeConfig: (
    nodeId: string,
    config: ImageGenerationNodeConfigDto,
  ) => void;
  duplicateImageNode: (nodeId: string) => void;
  deleteImageNode: (nodeId: string) => void;
};

const NodeAuthoringContext = createContext<NodeAuthoringContextValue | null>(
  null,
);

export function NodeAuthoringProvider({
  value,
  children,
}: {
  value: NodeAuthoringContextValue;
  children: ReactNode;
}) {
  return (
    <NodeAuthoringContext.Provider value={value}>
      {children}
    </NodeAuthoringContext.Provider>
  );
}

export function useNodeAuthoring() {
  const value = useContext(NodeAuthoringContext);
  if (!value) throw new Error("NODE_AUTHORING_PROVIDER_MISSING");
  return value;
}
