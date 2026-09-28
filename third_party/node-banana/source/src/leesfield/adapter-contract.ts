export type LeesfieldRuntimeGraph = {
  id: string;
  version: number;
  nodes: readonly unknown[];
  edges: readonly unknown[];
};

export type LeesfieldRuntimeCommand =
  | { type: "graph.changed"; graph: LeesfieldRuntimeGraph }
  | { type: "node.execute"; nodeId: string }
  | { type: "node.cancel"; nodeId: string };

export interface LeesfieldEditorAdapter {
  getGraph(): LeesfieldRuntimeGraph;
  dispatch(command: LeesfieldRuntimeCommand): void;
  subscribe(
    listener: (graph: LeesfieldRuntimeGraph) => void,
  ): () => void;
}

