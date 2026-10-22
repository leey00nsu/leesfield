import type {
  CanonicalEdge,
  CanonicalGraphIssue,
  CanonicalGroup,
  CanonicalNode,
} from "@/shared/generation-graph/canonical-graph";

import type { SpaceEditorDocument } from "./space-editor-types";

export type SpacePosition = CanonicalNode["position"];
export type SpaceNodeMeasurement = { width: number; height: number };
export type SpaceNodeMeasurements = Readonly<Record<string, SpaceNodeMeasurement>>;

export interface SpaceEditorClipboard {
  version: 1;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  groups: CanonicalGroup[];
}

export interface SpaceEditorIdMaps {
  nodes: ReadonlyMap<string, string>;
  edges: ReadonlyMap<string, string>;
  groups: ReadonlyMap<string, string>;
}

export type SpaceNewNode = Pick<CanonicalNode, "kind" | "position"> &
  Partial<Pick<CanonicalNode, "id" | "config" | "configVersion" | "selectedOutputAssetId">>;

/** Missing patch keys are untouched; null, false, zero and empty values are values. */
export type SpaceConfigFieldChange =
  | { path: readonly string[]; value: CanonicalNode["config"]; remove?: false }
  | { path: readonly string[]; remove: true };

export type SpaceEditorCommand =
  | { type: "title.set"; title: string }
  | { type: "node.add"; node: SpaceNewNode }
  | { type: "node.config.replace"; nodeId: string; config: CanonicalNode["config"] }
  | { type: "node.config.patch"; nodeId: string; patch: Record<string, CanonicalNode["config"]> }
  | { type: "node.config.fields"; nodeId: string; changes: readonly SpaceConfigFieldChange[] }
  | { type: "node.move"; nodeId: string; position: SpacePosition; updateMembership?: boolean }
  | { type: "nodes.move"; positions: Readonly<Record<string, SpacePosition>>; updateMembership?: boolean }
  | { type: "nodes.reorder"; nodeIds: readonly string[] }
  | { type: "node.remove"; nodeId: string }
  | { type: "nodes.remove"; nodeIds: readonly string[] }
  | { type: "output.select"; nodeId: string; assetId: string | null }
  | { type: "output.clear"; nodeId: string }
  | { type: "edge.connect"; edge: Omit<CanonicalEdge, "id" | "sortOrder"> & Partial<Pick<CanonicalEdge, "id" | "sortOrder">> }
  | { type: "edge.replace"; edgeId?: string; edge: Omit<CanonicalEdge, "id" | "sortOrder"> & Partial<Pick<CanonicalEdge, "id" | "sortOrder">> }
  | { type: "edge.disconnect"; edgeId: string }
  | { type: "edges.disconnect"; edgeIds: readonly string[] }
  | { type: "edge.pause"; edgeId: string; hasPause: boolean | undefined }
  | { type: "edge.reorder"; targetNodeId: string; targetPortId: string; edgeIds: readonly string[] }
  | { type: "group.create"; id?: string; memberNodeIds: readonly string[]; title?: string; color?: CanonicalGroup["color"]; bounds?: CanonicalGroup["bounds"]; locked?: boolean }
  | { type: "group.update"; groupId: string; patch: Partial<Pick<CanonicalGroup, "title" | "color" | "locked">> }
  | { type: "group.members"; groupId: string; memberNodeIds: readonly string[] }
  | { type: "group.ungroup"; nodeIds: readonly string[] }
  | { type: "group.move"; groupId: string; delta: SpacePosition }
  | { type: "group.resize"; groupId: string; bounds: CanonicalGroup["bounds"] }
  | { type: "group.delete"; groupId: string }
  | { type: "clipboard.paste"; clipboard: SpaceEditorClipboard; offset?: SpacePosition }
  | { type: "nodes.duplicate"; nodeIds: readonly string[]; offset?: SpacePosition }
  | { type: "batch"; commands: readonly SpaceEditorCommand[] };

export type SpaceEditorErrorCode =
  | "READ_ONLY" | "DISPOSED" | "RETIRED_NODE" | "UNSUPPORTED_NODE"
  | "NODE_NOT_FOUND" | "EDGE_NOT_FOUND" | "GROUP_NOT_FOUND"
  | "NODE_LIMIT" | "EDGE_LIMIT" | "GROUP_LIMIT" | "INVALID_GRAPH"
  | "INVALID_COMMAND" | "INVALID_CLIPBOARD" | "INVALID_ORDER"
  | "EMPTY_GROUP" | "DUPLICATE_ID" | "GESTURE_ACTIVE" | "NO_GESTURE";

export class SpaceEditorCommandError extends Error {
  constructor(public readonly code: SpaceEditorErrorCode, message: string = code) {
    super(message);
    this.name = "SpaceEditorCommandError";
  }
}

export type SpaceEditorFailure = {
  ok: false;
  code: SpaceEditorErrorCode;
  message: string;
  issues?: readonly CanonicalGraphIssue[];
};

export type SpaceEditorSuccess = {
  ok: true;
  changed: boolean;
  document: SpaceEditorDocument;
  /** Explicit representative-output intent, separate from canvas selection. */
  selectionNodeIds: readonly string[];
  /** Paste/duplicate canvas selection. */
  selectedNodeIds?: readonly string[];
  idMaps?: SpaceEditorIdMaps;
};

export type SpaceEditorCommandResult = SpaceEditorSuccess | SpaceEditorFailure;

export interface SpaceEditorCommandOptions {
  writable?: boolean;
  measurements?: SpaceNodeMeasurements;
  createId?: () => string;
}
