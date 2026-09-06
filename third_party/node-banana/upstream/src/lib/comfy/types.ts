/**
 * ComfyUI Integration Types
 *
 * A "Comfy App" is a ComfyUI workflow bound as a Node Banana node: its
 * author-curated inputs become typed handles, its widgets become inline
 * parameters, and its output nodes become typed output handles.
 *
 * The graph itself is always stored in ComfyUI's **API format** (the
 * `{ nodeId: { class_type, inputs } }` shape the engine executes). Editor-format
 * saves — what the ComfyUI "Save" menu produces, and the only format that
 * carries App Mode configuration — are converted on import.
 */

/* ── raw ComfyUI graph shapes ──────────────────────────────────── */

/** One node of an API-format graph. */
export interface ComfyGraphNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

/** An API-format ("prompt") graph — what gets submitted to the engine. */
export type ComfyGraph = Record<string, ComfyGraphNode>;

/**
 * ComfyUI's `/api/object_info` catalog — the node schema registry. Loosely
 * typed; only the input specs are ever read.
 */
export type ComfyObjectInfo = Record<
  string,
  {
    input?: {
      required?: Record<string, unknown>;
      optional?: Record<string, unknown>;
    };
    display_name?: string;
    description?: string;
    category?: string;
  }
>;

/** An API input value of the form `[sourceNodeId, sourceOutputSlot]`. */
export type ComfyLink = [string, number];

/* ── app definition (the persisted node contract) ──────────────── */

/** Handle data types a Comfy app can consume. */
export type ComfyInputType = "image" | "text" | "audio" | "video";

/** Handle data types a Comfy app can produce. */
export type ComfyOutputType = "image" | "video" | "audio" | "text" | "3d";

/**
 * A connectable input: rendered as a typed target handle on the node and fed
 * from upstream nodes at run time.
 */
export interface ComfyAppInput {
  /** Stable id — `${nodeId}:${inputKey}`. */
  id: string;
  /** Schema name used for `dynamicInputs` lookup (unique, slugified). */
  name: string;
  label: string;
  type: ComfyInputType;
  /** Graph binding: the node whose input this feeds. */
  nodeId: string;
  inputKey: string;
  required: boolean;
  description?: string;
  /**
   * Extra graph bindings this one handle also writes.
   *
   * The same story as {@link ComfyAppParam.alsoBind}: a Blueprint's `STRING`
   * boundary slot can reach several inner widgets — one prompt feeding two text
   * encoders — and the author exposed one connection point for all of them.
   * Because a boundary slot becomes a *handle* rather than a setting, the
   * carry-through has to exist on both shapes or the secondary encoders keep
   * the workflow's saved text while the primary one gets the user's.
   */
  alsoBind?: Array<{ nodeId: string; inputKey: string }>;
}

/**
 * An inline widget parameter: rendered in the node's settings panel and
 * patched into the graph at run time.
 */
/**
 * A tone curve — the value of ComfyUI's `CURVE` widget.
 *
 * Points are normalised to 0–1 in both axes and ordered by x; the first and last
 * anchor the ends of the range. This is the exact JSON the engine expects back,
 * so it is stored and sent verbatim rather than reduced to something flatter.
 */
export interface ComfyCurve {
  points: Array<[number, number]>;
  /** ComfyUI's default is `monotone_cubic`; unknown values are passed through. */
  interpolation?: string;
}

export interface ComfyAppParam {
  /** Stable id — `${nodeId}:${inputKey}`. */
  id: string;
  label: string;
  nodeId: string;
  inputKey: string;
  type: "string" | "number" | "integer" | "boolean" | "curve";
  /** Discrete choices when the widget is a combo. */
  enum?: string[];
  default?: string | number | boolean | ComfyCurve;
  minimum?: number;
  maximum?: number;
  description?: string;
  /** True for `seed`-like inputs, which are re-randomised per run by default. */
  isSeed?: boolean;
  /**
   * Extra graph bindings this one setting also writes.
   *
   * A Blueprint boundary slot can feed several inner nodes — one `ckpt_name`
   * reaching a checkpoint loader, a VAE loader and a text-encoder loader. The
   * author exposed one control, so one control it stays; without this the user
   * could change the model and silently leave its VAE on the old one.
   */
  alsoBind?: Array<{ nodeId: string; inputKey: string }>;
  /** Multi-line text (prompt boxes) render as a textarea. */
  multiline?: boolean;
}

/** An output node bound to a typed source handle on the node. */
export interface ComfyAppOutput {
  /** Stable id — the graph node id. */
  id: string;
  label: string;
  type: ComfyOutputType;
  nodeId: string;
  classType: string;
}

/** Where an app came from — drives the badge shown on the node. */
export type ComfyAppSource = "upload" | "blueprint" | "template" | "cloud";

/**
 * A ComfyUI workflow bound as a node. Embedded in node data so a saved Node
 * Banana workflow stays runnable without the original file.
 */
export interface ComfyAppDefinition {
  id: string;
  name: string;
  description: string;
  source: ComfyAppSource;
  /** API-format graph, ready to patch and submit. */
  graph: ComfyGraph;
  inputs: ComfyAppInput[];
  params: ComfyAppParam[];
  outputs: ComfyAppOutput[];
  /** Distinct class types — used for engine compatibility checks. */
  classTypes: string[];
  nodeCount: number;
  createdAt: number;
  /** Optional preview image (data URL) shown in the app library. */
  thumbnail?: string | null;
}

/* ── import-time inspection ────────────────────────────────────── */

/** A graph node that could serve as an image input or an output. */
export interface ComfyNodeCandidate {
  nodeId: string;
  classType: string;
  /** Node title if set, else `ClassType (#id)`. */
  label: string;
}

/**
 * A widget the author could expose — either as a connectable handle or as an
 * inline parameter. The import dialog turns these into the final contract.
 */
export interface ComfyWidgetCandidate {
  nodeId: string;
  inputKey: string;
  classType: string;
  label: string;
  valueType: "text" | "number" | "integer" | "boolean" | "select" | "curve";
  currentValue: string | number | boolean | ComfyCurve;
  options?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  multiline?: boolean;
  isSeed?: boolean;
  /**
   * The handle type this widget would take if promoted to a connection —
   * `text` for prompt-shaped strings, null when it only makes sense inline.
   */
  connectableAs: ComfyInputType | null;
  /** True when the author curated this widget via App Mode. */
  fromAppMode: boolean;
}

/** Everything the import dialog needs to build a contract from a raw upload. */
export interface ComfyWorkflowInspection {
  nodeCount: number;
  classTypes: string[];
  /** LoadImage-style nodes — each becomes an image input handle. */
  imageInputCandidates: ComfyNodeCandidate[];
  /** Audio/video loader nodes. */
  mediaInputCandidates: ComfyNodeCandidate[];
  /** Save/Preview nodes — each becomes an output handle. */
  outputCandidates: ComfyNodeCandidate[];
  /** Every literal widget in the graph, App Mode ones flagged. */
  widgetCandidates: ComfyWidgetCandidate[];
  /** True when the upload carried an App Mode (linear mode) configuration. */
  hasAppMode: boolean;
  /** Node ids the author marked as App Mode outputs, in order. */
  appModeOutputNodeIds: string[];
  /** The suggested contract, pre-filled from App Mode when present. */
  suggested: {
    name: string;
    inputs: ComfyAppInput[];
    params: ComfyAppParam[];
    outputs: ComfyAppOutput[];
  };
  /** Blueprints (subgraph definitions) found alongside the workflow. */
  blueprints: ComfyBlueprintSummary[];
  /** Non-fatal notes to surface in the dialog (e.g. muted nodes dropped). */
  warnings: string[];
}

/* ── blueprints ────────────────────────────────────────────────── */

/**
 * A ComfyUI Blueprint — a reusable subgraph. Its boundary slots declare the
 * inputs and outputs, so a blueprint maps onto an app node directly.
 */
export interface ComfyBlueprintSummary {
  id: string;
  name: string;
  description?: string;
  /** Boundary input slot names, in order. */
  inputNames: string[];
  /** Boundary output slot names, in order. */
  outputNames: string[];
  nodeCount: number;
  /** Where it was discovered. */
  source: "workflow" | "engine" | "template";
  /** Preview image URL, when the source provides one. */
  thumbnail?: string | null;
}

/* ── execution ─────────────────────────────────────────────────── */

/** Which engine a run targets. */
export type ComfyBackendMode = "cloud" | "local" | "remote";

/** Resolved connection details for one run. */
export interface ComfyConnection {
  mode: ComfyBackendMode;
  baseUrl: string;
  apiKey: string | null;
  /**
   * True when the endpoint speaks the Comfy API v2 (`/api/v2/jobs`) and can be
   * driven by `@comfyorg/sdk`; false for a stock ComfyUI, which only has the
   * legacy `/api/prompt` surface.
   */
  useSdk: boolean;
  jobTimeoutMs: number;
}

/** A file an engine produced. */
export interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  /** `output` | `temp` | `input` */
  type: string;
  mediaType: ComfyOutputType;
  /** Which graph node emitted it. */
  nodeId: string;
}

/**
 * Raw outputs object, shared by the legacy `/history/{id}` response and the
 * Cloud `/api/jobs/{id}` response.
 */
export interface ComfyRawOutputs {
  [nodeId: string]: {
    images?: Array<Record<string, unknown>>;
    videos?: Array<Record<string, unknown>>;
    gifs?: Array<Record<string, unknown>>;
    audio?: Array<Record<string, unknown>>;
    text?: string[];
    [key: string]: unknown;
  };
}

/** One resolved output, ready to hand back to the node. */
export interface ComfyResolvedOutput {
  /** The app output handle this belongs to. */
  handleId: string;
  type: ComfyOutputType;
  /** Data URL for media, plain string for text. */
  value: string;
}

/** Live progress reported while a job runs. */
export interface ComfyRunProgress {
  status: string;
  /** 0–1 when the engine reports it. */
  progress?: number;
  /** Currently executing node's title/class. */
  currentNode?: string;
}
