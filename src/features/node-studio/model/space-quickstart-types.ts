import type { GenerationGraphEdgeDto, GenerationGraphNodeDto } from "./graph-types";

/** Product-owned template payload. Node kinds, configs and ports are canonical. */
export type SpacePresetWorkflow = {
  id: string;
  title: string;
  schemaVersion: 3;
  nodes: GenerationGraphNodeDto[];
  edges: GenerationGraphEdgeDto[];
  groups: [];
};

export type SpaceQuickstartContent = "empty" | "minimal";

export type SpaceQuickstartTemplate = {
  id: string;
  name: string;
  description: string;
  category: "simple" | "advanced";
  icon: string;
  imageCount: 2 | 3;
  prompt: string;
};
