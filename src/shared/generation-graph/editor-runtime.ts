import type { CanonicalEdge, CanonicalNode, GraphDocumentV3 } from "./canonical-graph";

export type DurableEditorCommand =
  | { type: "node.add"; node: CanonicalNode }
  | { type: "node.update"; nodeId: string; patch: Partial<Pick<CanonicalNode, "position" | "config">> }
  | { type: "node.remove"; nodeId: string }
  | { type: "edge.connect"; edge: CanonicalEdge }
  | { type: "edge.disconnect"; edgeId: string }
  | { type: "node.output.select"; nodeId: string; assetId: string | null };

export type NodeExecutionEvent = {
  graphId: string;
  nodeId: string;
  executionId: string;
  status: "pending" | "processing" | "uploading" | "completed" | "failed" | "cancelled";
  progress: number;
};

export type RuntimeProjection<TRuntimeState> = {
  state: TRuntimeState;
  writable: boolean;
  readOnlyReason: string | null;
};

/**
 * The host owns persistence and execution; an editor implementation owns only
 * ephemeral interaction state such as selection, viewport, clipboard and undo.
 */
export interface EditorRuntimeAdapter<TRuntimeState> {
  readonly engineId: string;
  project(graph: GraphDocumentV3): RuntimeProjection<TRuntimeState>;
  applyCommand(graph: GraphDocumentV3, command: DurableEditorCommand): GraphDocumentV3;
  projectExecutionEvent(state: TRuntimeState, event: NodeExecutionEvent): TRuntimeState;
}
