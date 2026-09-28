export type HostedPresetWorkflow = {
  id: string; version: number; name: string; edgeStyle?: string;
  nodes: { id: string; type: string; position: { x: number; y: number }; style?: { width?: number; height?: number }; data: Record<string, unknown> }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[];
};
