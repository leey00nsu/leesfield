import type { CanonicalGroup } from "@/shared/generation-graph/canonical-graph";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type GenerationGraphSummaryDto = {
  id: string;
  title: string;
  version: number;
  schemaVersion: 2 | 3;
  minimumWriterVersion: 2 | 3;
  createdAt: string;
  updatedAt: string;
};

export type ImageGenerationNodeConfigDto = {
  prompt: string;
  modelKey: string | null;
  parameters: Record<string, JsonValue>;
  presentation?: {
    customTitle?: string;
    comment?: string;
    isOptional?: boolean;
  };
};

export type GenerationGraphNodeDto = {
  id: string;
  kind: string;
  position: { x: number; y: number };
  configVersion: number;
  config: JsonValue;
  selectedOutputAssetId: string | null;
};

export type GenerationGraphEdgeDto = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string;
  targetPortId: string;
  sortOrder: number;
  hasPause?: boolean;
};

export type GenerationGraphSnapshotDto = GenerationGraphSummaryDto & {
  groups: CanonicalGroup[];
  nodes: GenerationGraphNodeDto[];
  edges: GenerationGraphEdgeDto[];
  writable?: boolean;
  readOnlyReason?: string | null;
};

export type UpdateGenerationGraphDto = {
  schemaVersion: 3;
  groups: CanonicalGroup[];
  expectedVersion: number;
  title: string;
  nodes: Array<{
    id: string;
    kind: string;
    position: { x: number; y: number };
    configVersion: number;
    config: JsonValue;
    selectedOutputAssetId: string | null;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    sortOrder: number;
    hasPause?: boolean;
  }>;
};
