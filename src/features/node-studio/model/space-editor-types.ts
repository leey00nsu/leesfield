import type {
  CanonicalGraphIssueCode,
  CanonicalNode,
  GraphDocumentV3,
} from "@/shared/generation-graph/canonical-graph";
import type {
  PortDefinition,
  PortValueType,
} from "@/shared/generation-graph/node-registry";

import type { UpdateGenerationGraphDto } from "./graph-types";
import type { NodeExecutionDto } from "./node-execution-types";

/** The existing autosave wire draft. Canvas interaction state lives outside it. */
export type SpaceEditorDocument = Omit<UpdateGenerationGraphDto, "expectedVersion">;

export type SpaceEditorGraphIdentity = Pick<GraphDocumentV3, "id" | "version">;

export interface SpaceCanvasSettings {
  panMode: "space" | "middleMouse" | "always";
  zoomMode: "altScroll" | "ctrlScroll" | "scroll";
  selectionMode: "click" | "altDrag" | "shiftDrag";
}

export const defaultSpaceCanvasSettings: Readonly<SpaceCanvasSettings> = {
  panMode: "space",
  zoomMode: "altScroll",
  selectionMode: "click",
};

/** Canonical ports, with an optional ordered slot; never a canvas handle ID. */
export interface SpacePortReference {
  nodeId: CanonicalNode["id"];
  portId: PortDefinition["id"];
  direction: PortDefinition["direction"];
  slot?: number;
}

/** System reconciliation must not become a user undo/selection intent. */
export type SpaceEditorTransactionOrigin = "user" | "system";

export interface SpaceNodeGeometry {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface SpaceNodeCatalogItem {
  title: string;
  paletteLabel: string;
  category: "Input" | "Text" | "Generate" | "Process" | "Output";
  mediaType: PortValueType;
  geometry: Readonly<SpaceNodeGeometry>;
  supportsOptionalInput?: boolean;
}

/** A node's canonical content and registry information for a presenter. */
export interface SpaceNodeDisplay {
  node: CanonicalNode;
  ports: readonly PortDefinition[];
  supported: boolean;
  supportReason: CanonicalGraphIssueCode | null;
}

/** Transient per-node results and upload feedback, excluded from graph saves. */
export interface SpaceNodeRuntime {
  execution?: NodeExecutionDto;
  /** Local admission/observation is active, even before history has returned. */
  submissionPending?: boolean;
  /** Current UI request's result node/slot IDs; never persisted to the graph. */
  resultReservationIds?: readonly string[];
  uploadProgress?: number;
  uploadError?: string | null;
  /** A request-owned token; a late selection may only clear its own busy state. */
  selectionPending?: object;
  repeatProgress?: { completed: number; failed: number; total: number; running: boolean };
}
