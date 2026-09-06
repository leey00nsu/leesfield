"use client";

import type { NodeBananaCanvasSettings } from "@node-banana-runtime/runtime-entry";

import type { GraphDraft } from "../hook/use-graph-autosave";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { NodeAuthoringCatalogState } from "../model/node-authoring-context";
import { NodeBananaStudio } from "./node-banana-studio";

type NodeStudioProps = {
  graph: GenerationGraphSnapshotDto;
  onDraftChange: (draft: GraphDraft) => void;
  prepareImageNodeExecution?: () => Promise<number>;
  catalog?: NodeAuthoringCatalogState;
  canvasSettings?: NodeBananaCanvasSettings;
  onRegenerateNode?: (nodeId: string) => void | Promise<void | { selectedOutputAssetId?: string | null; outputAssetIds?: string[]; outputGrid?: { rows: number; cols: number } }>;
  onCancelNode?: (nodeId: string) => Promise<void>;
  onOpenAnnotation?: (nodeId: string) => void;
  onCloseAnnotation?: (nodeId: string) => void;
  onInputMediaUpload?: (input: {
    nodeId: string;
    mediaType: "image" | "audio" | "video";
    dataUrl: string;
    filename: string | null;
    mimeType: string | null;
  }) => Promise<{ assetId: string }>;
  onAnnotationOutput?: (input: {
    nodeId: string;
    dataUrl: string;
    annotations: Record<string, unknown>[];
  }) => Promise<{ assetId: string }>;
  onHostError?: (error: Error) => void;
  onExpandNode?: (nodeId: string, nodeType: string) => void;
  resolveUpstreamNodeData?: (
    nodeId: string,
    runtimeData: Record<string, unknown>,
  ) => Record<string, unknown> | null | undefined;
};

const emptyCatalog: NodeAuthoringCatalogState = {
  imageModels: [],
  isLoading: false,
  error: null,
  retry: () => undefined,
};

export function NodeStudio({
  graph,
  onDraftChange,
  prepareImageNodeExecution = async () => graph.version,
  catalog = emptyCatalog,
  canvasSettings = { panMode: "space", zoomMode: "altScroll", selectionMode: "click" },
  onRegenerateNode,
  onCancelNode,
  onOpenAnnotation,
  onCloseAnnotation,
  onInputMediaUpload,
  onAnnotationOutput,
  onHostError,
  onExpandNode,
  resolveUpstreamNodeData,
}: NodeStudioProps) {
  return (
    <NodeBananaStudio
      graph={graph}
      onDraftChange={onDraftChange}
      prepareImageNodeExecution={prepareImageNodeExecution}
      catalog={catalog}
      writable={graph.writable !== false}
      readOnlyReason={graph.readOnlyReason ?? null}
      canvasSettings={canvasSettings}
      onRegenerateNode={onRegenerateNode}
      onCancelNode={onCancelNode}
      onOpenAnnotation={onOpenAnnotation}
      onCloseAnnotation={onCloseAnnotation}
      onInputMediaUpload={onInputMediaUpload}
      onAnnotationOutput={onAnnotationOutput}
      onHostError={onHostError}
      onExpandNode={onExpandNode}
      resolveUpstreamNodeData={resolveUpstreamNodeData}
    />
  );
}
