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
  createdAt: string;
  updatedAt: string;
};

export type ImageGenerationNodeConfigDto = {
  prompt: string;
  modelKey: string | null;
  parameters: Record<string, JsonValue>;
};

export type GenerationGraphNodeDto = {
  id: string;
  type: "imageGeneration";
  position: { x: number; y: number };
  configVersion: 1;
  config: ImageGenerationNodeConfigDto;
  selectedOutputImageId: string | null;
};

export type GenerationGraphEdgeDto = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: "primary" | "reference";
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type GenerationGraphSnapshotDto = GenerationGraphSummaryDto & {
  nodes: GenerationGraphNodeDto[];
  edges: GenerationGraphEdgeDto[];
};

export type UpdateGenerationGraphDto = Pick<
  GenerationGraphSnapshotDto,
  "title" | "nodes" | "edges"
> & { expectedVersion: number };
