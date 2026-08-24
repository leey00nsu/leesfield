"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { RuntimeImageModel } from "@/shared/model-catalog/runtime-utils";

import type { ImageGenerationNodeConfigDto } from "./graph-types";

export type NodeAuthoringCatalogState = {
  imageModels: readonly RuntimeImageModel[];
  isLoading: boolean;
  error: string | null;
  retry: () => void;
};

type NodeAuthoringContextValue = NodeAuthoringCatalogState & {
  graphId: string;
  prepareImageNodeExecution: () => Promise<number>;
  selectImageNodeOutput: (
    nodeId: string,
    selectedOutputImageId: string,
  ) => void;
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
