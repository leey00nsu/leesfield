"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeLlmModel,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";

import type { ImageGenerationNodeConfigDto } from "./graph-types";
import type { ImageNodeInputReadiness } from "./node-input-readiness";
import type { NodeRunReadiness } from "./node-run-readiness";
import type { AssistantResults } from "@/shared/generation-graph/assistant-output";
import type { MediaOutputBinding } from "@/shared/generation-graph/media-output";
import type { GenerationAttachmentSlot } from "./generation-prompt-attachments";

export type NodeAuthoringCatalogState = {
  imageModels: readonly RuntimeImageModel[];
  videoModels?: readonly RuntimeVideoModel[];
  audioModels?: readonly RuntimeAudioModel[];
  llmModels?: readonly RuntimeLlmModel[];
  assistantResults?: AssistantResults;
  mediaOutputs?: Readonly<Record<string, readonly MediaOutputBinding[]>>;
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
  runNode?: (nodeId: string) => Promise<unknown>;
  cancelNode?: (nodeId: string) => Promise<void>;
  writable?: boolean;
  updateCanonicalNodeConfig?: (nodeId: string, config: CanonicalJsonValue) => void;
  updateMemoNodeSize?: (nodeId: string, size: { width: number; height: number }) => void;
  getImageNodeInputReadiness: (nodeId: string) => ImageNodeInputReadiness;
  getNodeRunReadiness?: (nodeId: string) => NodeRunReadiness;
  getNodePromptInput?: (nodeId: string) => NodePromptInputState;
  getNodeInputAssetId?: (nodeId: string, targetPortId: string) => string | null;
  getNodeInputAssetIds?: (nodeId: string, targetPortId: string) => string[];
  replaceNodeInputAssets?: (nodeId: string, slot: GenerationAttachmentSlot, assetIds: readonly string[],
    expected: { modelKey: unknown; assetIds: readonly string[] }) => boolean;
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
