/**
 * ComfyUI API-format graph parsing and patching.
 *
 * Pure functions — no network, no Node built-ins — so they run identically in
 * an API route and in a Vitest unit test.
 */

import type {
  ComfyCurve,
  ComfyGraph,
  ComfyGraphNode,
  ComfyInputType,
  ComfyLink,
  ComfyObjectInfo,
  ComfyOutputType,
} from "./types";

/* ── class-type registries ─────────────────────────────────────── */

/** Nodes whose `image` widget names an uploaded file — image entry points. */
export const IMAGE_LOADER_CLASS_TYPES = new Set([
  "LoadImage",
  "LoadImageMask",
  "LoadImageOutput",
  "ETN_LoadImageBase64",
  "Image Load",
  "LoadImageFromUrl",
]);

/** Nodes whose widget names an uploaded audio file. */
export const AUDIO_LOADER_CLASS_TYPES = new Set([
  "LoadAudio",
  "VHS_LoadAudio",
  "LoadAudioUpload",
]);

/** Nodes whose widget names an uploaded video file. */
export const VIDEO_LOADER_CLASS_TYPES = new Set([
  "LoadVideo",
  "VHS_LoadVideo",
  "VHS_LoadVideoPath",
]);

/** Output (sink) nodes, mapped to the handle type they produce. */
export const OUTPUT_CLASS_TYPES: Record<string, ComfyOutputType> = {
  SaveImage: "image",
  PreviewImage: "image",
  SaveImageWebsocket: "image",
  Image_Save: "image",
  SaveAnimatedWEBP: "image",
  SaveAnimatedPNG: "image",
  SaveVideo: "video",
  VHS_VideoCombine: "video",
  SaveWEBM: "video",
  SaveAudio: "audio",
  SaveAudioMP3: "audio",
  SaveAudioOpus: "audio",
  PreviewAudio: "audio",
  SaveGLB: "3d",
  Preview3D: "3d",
  Preview3DAnimation: "3d",
  PreviewAny: "text",
  ShowText: "text",
  "ShowText|pysssss": "text",
  SaveText: "text",
  DisplayText: "text",
};

/** Preview nodes rewritten to a persisting sink so outputs survive the run. */
const PREVIEW_TO_SAVE: Record<string, string> = {
  PreviewImage: "SaveImage",
  SaveImageWebsocket: "SaveImage",
};

/**
 * Widgets that are plumbing, never a user-facing parameter.
 *
 * `prompt` deliberately is NOT here. ComfyUI does have a hidden input by that
 * name, but hidden inputs are declared outside `required`/`optional` and are
 * never serialised into a graph, so skipping the name could only ever hit a
 * real one — and 167 node types declare a genuine required `prompt` widget,
 * every image-edit encoder among them. Blacklisting it meant an "image edit"
 * node imported with no prompt at all and ran a paid job on an empty edit
 * instruction: a silently wrong result rather than a visible failure.
 */
const WIDGET_SKIP_KEYS = new Set([
  "image",
  "audio",
  "video",
  "filename_prefix",
  "choose file to upload",
  "upload",
  "control_after_generate",
  "unique_id",
  "extra_pnginfo",
]);

/**
 * Filenames the Blueprint importer writes into a loader it materialised.
 *
 * A blueprint's media arrives through a boundary slot, so a loader node has to
 * be invented to carry it — and invented with *some* filename. These are that
 * filename: a stand-in, never a value anyone chose.
 *
 * Which makes them the signal for "this input has no real default". A stock
 * ComfyUI ships an `example.png`, and so does Comfy Cloud, so running an
 * unwired node did not fail — it succeeded and returned a picture of ComfyUI's
 * own sample image, billed and plausible-looking.
 */
export const PLACEHOLDER_IMAGE = "example.png";
export const PLACEHOLDER_VIDEO = "example.mp4";
export const PLACEHOLDER_AUDIO = "example.mp3";

const PLACEHOLDER_MEDIA = new Set([PLACEHOLDER_IMAGE, PLACEHOLDER_VIDEO, PLACEHOLDER_AUDIO]);

/** Whether a loader still holds the stand-in filename the importer gave it. */
export function isPlaceholderMedia(value: unknown): boolean {
  return typeof value === "string" && PLACEHOLDER_MEDIA.has(value);
}

/** Widget names that read as a prompt — promotable to a text handle. */
const PROMPT_KEY = /(^|_)(prompt|text|caption|description|instruction)(_|$)/i;

/** Class types whose string widget is the prompt (positive/negative encoders). */
const TEXT_ENCODER_CLASS = /CLIPTextEncode|TextEncode|StringConstant|PrimitiveString|Text Multiline|CR Text/i;

/* ── helpers ───────────────────────────────────────────────────── */

/** An API input value of the form `[sourceNodeId, sourceOutputSlot]`. */
export function isLink(value: unknown): value is ComfyLink {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}

/** A widget's leaf name — dynamic-combo sub-widgets serialize as `a.b.c`. */
export function leafKey(inputKey: string): string {
  const dot = inputKey.lastIndexOf(".");
  return dot === -1 ? inputKey : inputKey.slice(dot + 1);
}

/** Seed inputs are re-randomised per run so repeat runs actually vary. */
export function isSeedKey(inputKey: string): boolean {
  const leaf = leafKey(inputKey);
  return leaf === "seed" || leaf === "noise_seed" || leaf.endsWith("_seed");
}

/** Friendly default labels for the loader/sink classes users see most. */
const FRIENDLY_CLASS_LABEL: Record<string, string> = {
  LoadImage: "Image",
  LoadImageMask: "Mask",
  LoadImageOutput: "Image",
  LoadAudio: "Audio",
  VHS_LoadAudio: "Audio",
  LoadVideo: "Video",
  VHS_LoadVideo: "Video",
  SaveImage: "Image",
  PreviewImage: "Image",
  SaveVideo: "Video",
  VHS_VideoCombine: "Video",
  SaveAudio: "Audio",
  PreviewAudio: "Audio",
  SaveGLB: "3D Model",
  PreviewAny: "Text",
  ShowText: "Text",
  SaveText: "Text",
};

/**
 * Human label for a node.
 *
 * The author's title wins. Failing that, a boundary node gets a plain
 * type name — "Image" reads better on a handle than "LoadImage (#1)" — and
 * anything else falls back to `ClassType (#id)`, which at least locates it in
 * the original workflow.
 */
export function nodeLabel(nodeId: string, node: ComfyGraphNode): string {
  const title = node._meta?.title?.trim();
  if (title) return title;
  return FRIENDLY_CLASS_LABEL[node.class_type] ?? `${node.class_type} (#${nodeId})`;
}

/** `Sampler Steps` from `sampler_steps`. */
export function humanizeKey(key: string): string {
  return leafKey(key)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Distinct class types in a graph — used to check whether an engine has every
 * node pack the workflow needs.
 */
export function graphClassTypes(graph: ComfyGraph): string[] {
  return [...new Set(Object.values(graph).map((n) => n.class_type))].sort();
}

/* ── parsing ───────────────────────────────────────────────────── */

/**
 * Coerce an uploaded JSON blob into an API-format graph.
 *
 * Accepts both the bare graph and the `{prompt: {...}}` envelope some tools
 * emit. Throws a message aimed at the user when the file is an editor save
 * (which needs conversion first) or isn't a graph at all.
 */
export function parseApiGraph(raw: unknown): ComfyGraph {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workflow must be a ComfyUI workflow JSON object");
  }
  const envelope = raw as { prompt?: unknown };
  const candidate = (
    envelope.prompt !== null && typeof envelope.prompt === "object"
      ? envelope.prompt
      : raw
  ) as Record<string, unknown>;

  const entries = Object.entries(candidate).filter(
    ([, v]) => v !== null && typeof v === "object" && "class_type" in (v as object)
  );
  if (entries.length === 0) {
    throw new Error(
      "No executable nodes found. Save the workflow from ComfyUI (or export it in API format) and try again."
    );
  }
  return Object.fromEntries(entries) as ComfyGraph;
}

/* ── combo options ─────────────────────────────────────────────── */

/** Option strings from an `/object_info` input spec, or null if not a COMBO. */
function optionsFromSpec(spec: unknown): string[] | null {
  if (!Array.isArray(spec)) return null;
  const type = spec[0];
  // Classic combos: the type IS the option array. V3 combos: type "COMBO" with
  // the options under the config object.
  const raw = Array.isArray(type)
    ? type
    : type === "COMBO" && spec[1] && typeof spec[1] === "object"
      ? (spec[1] as { options?: unknown }).options
      : null;
  if (!Array.isArray(raw)) return null;
  const values = raw.filter((v): v is string => typeof v === "string");
  return values.length > 0 ? values : null;
}

/** The `[type, options]` spec for one input of a node, from the catalog. */
export function specFor(
  objectInfo: ComfyObjectInfo | undefined,
  node: ComfyGraphNode,
  inputKey: string
): unknown[] | null {
  const input = objectInfo?.[node.class_type]?.input;
  if (!input) return null;
  let entries: Record<string, unknown> = {
    ...(input.required ?? {}),
    ...(input.optional ?? {}),
  };
  const parts = inputKey.split(".");
  for (let depth = 0; depth < parts.length; depth += 1) {
    const entry = entries[parts[depth]!];
    if (depth === parts.length - 1) return Array.isArray(entry) ? entry : null;
    // Intermediate segment: descend into the selected dynamic-combo option.
    if (!Array.isArray(entry)) return null;
    const cfg = entry[1] as { options?: unknown } | undefined;
    const dynOptions = Array.isArray(cfg?.options) ? cfg.options : [];
    const selected = node.inputs[parts.slice(0, depth + 1).join(".")];
    const option = dynOptions.find(
      (o): o is { key: unknown; inputs?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } } =>
        o !== null && typeof o === "object" && (o as { key?: unknown }).key === selected
    );
    if (!option?.inputs) return null;
    entries = { ...(option.inputs.required ?? {}), ...(option.inputs.optional ?? {}) };
  }
  return null;
}

/**
 * Discrete dropdown choices for an input, or null when it is free-form.
 *
 * Recognises `CustomCombo` — the author-defined dropdown whose choices live in
 * its sibling `option1..optionN` inputs — and otherwise reads the engine's
 * `/object_info` catalog.
 */
export function comboOptions(
  node: ComfyGraphNode,
  inputKey: string,
  objectInfo?: ComfyObjectInfo
): string[] | null {
  if (node.class_type === "CustomCombo" && inputKey === "choice") {
    const seen = new Set<string>();
    const values = Object.entries(node.inputs)
      .filter((e): e is [string, string] => /^option\d+$/.test(e[0]) && typeof e[1] === "string")
      .sort((a, b) => Number(a[0].slice(6)) - Number(b[0].slice(6)))
      .map(([, v]) => v.trim())
      .filter((v) => v !== "" && !seen.has(v) && (seen.add(v), true));
    return values.length > 0 ? values : null;
  }
  return optionsFromSpec(specFor(objectInfo, node, inputKey));
}

/**
 * The value type the engine declares for a widget, or null when unknown.
 *
 * This beats inferring from the current value: a `FLOAT` widget sitting at `0`
 * serializes as an integer in JSON, and typing it as one would stop the user
 * entering `0.5`.
 */
export function declaredWidgetType(
  objectInfo: ComfyObjectInfo | undefined,
  node: ComfyGraphNode,
  inputKey: string
): "text" | "number" | "integer" | "boolean" | "select" | "curve" | null {
  const spec = specFor(objectInfo, node, inputKey);
  if (!spec) return null;
  const type = spec[0];
  if (Array.isArray(type)) return "select";
  if (type === "COMBO") return "select";
  if (type === "FLOAT") return "number";
  if (type === "INT") return "integer";
  if (type === "BOOLEAN") return "boolean";
  if (type === "STRING") return "text";
  if (type === "CURVE") return "curve";
  return null;
}

/** Numeric bounds and multiline flag declared for a widget in the catalog. */
export function widgetConstraints(
  objectInfo: ComfyObjectInfo | undefined,
  node: ComfyGraphNode,
  inputKey: string
): { minimum?: number; maximum?: number; multiline?: boolean; description?: string } {
  const spec = specFor(objectInfo, node, inputKey);
  const opts = (spec?.[1] && typeof spec[1] === "object" ? spec[1] : {}) as Record<string, unknown>;
  const out: { minimum?: number; maximum?: number; multiline?: boolean; description?: string } = {};
  const bound = (raw: unknown): number | undefined => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    // A generic primitive declares the int64/float extremes, which mean "no
    // limit" rather than a range. Surfacing them would show the user a bound of
    // ±9,223,372,036,854,775,807 and make a slider meaningless.
    return Math.abs(raw) > Number.MAX_SAFE_INTEGER ? undefined : raw;
  };
  const minimum = bound(opts.min);
  const maximum = bound(opts.max);
  if (minimum !== undefined) out.minimum = minimum;
  if (maximum !== undefined) out.maximum = maximum;
  if (opts.multiline === true) out.multiline = true;
  if (typeof opts.tooltip === "string" && opts.tooltip.trim()) out.description = opts.tooltip.trim();
  return out;
}

/* ── input/output classification ───────────────────────────────── */

/** The media type a loader node ingests, or null when it isn't a loader. */
export function loaderInputType(classType: string): ComfyInputType | null {
  if (IMAGE_LOADER_CLASS_TYPES.has(classType)) return "image";
  if (AUDIO_LOADER_CLASS_TYPES.has(classType)) return "audio";
  if (VIDEO_LOADER_CLASS_TYPES.has(classType)) return "video";
  return null;
}

/** Widget names loader nodes conventionally read their uploaded file from. */
const LOADER_WIDGET_CANDIDATES: Record<ComfyInputType, string[]> = {
  image: ["image"],
  audio: ["audio", "audioUI", "file"],
  video: ["video", "file"],
  text: [],
};

/**
 * The widget a loader node reads its uploaded filename from.
 *
 * Node packs disagree — core `LoadVideo` uses `file` while `VHS_LoadVideo`
 * uses `video` — so the node's own inputs are the authority: the widget whose
 * value is a string is the filename slot. The conventional names are only the
 * tie-breaker, and the fallback is used when the graph carries no such widget
 * (the widget is there, just empty).
 */
export function loaderWidgetKey(classType: string, node?: ComfyGraphNode): string {
  const type = loaderInputType(classType) ?? "image";
  const candidates = LOADER_WIDGET_CANDIDATES[type];

  if (node) {
    // A conventional name the node actually declares wins.
    for (const candidate of candidates) {
      if (candidate in node.inputs) return candidate;
    }
    // Otherwise the sole string widget is the filename slot.
    const strings = Object.entries(node.inputs).filter(
      ([key, value]) => typeof value === "string" && !WIDGET_SKIP_KEYS.has(key.toLowerCase())
    );
    if (strings.length === 1 && strings[0]) return strings[0][0];
  }
  return candidates[0] ?? "image";
}

/** The handle type a sink node produces, or null when it isn't a sink. */
export function outputTypeFor(classType: string): ComfyOutputType | null {
  return OUTPUT_CLASS_TYPES[classType] ?? null;
}

/**
 * Whether a string widget reads as a prompt — i.e. is worth offering as a
 * connectable text handle rather than only an inline box.
 */
export function isPromptWidget(node: ComfyGraphNode, inputKey: string): boolean {
  if (TEXT_ENCODER_CLASS.test(node.class_type)) return true;
  return PROMPT_KEY.test(leafKey(inputKey));
}

/** Whether a widget should be offered to the user at all. */
export function isExposableWidget(node: ComfyGraphNode, inputKey: string, value: unknown): boolean {
  if (isLink(value)) return false;
  if (WIDGET_SKIP_KEYS.has(leafKey(inputKey).toLowerCase())) return false;
  // A CustomCombo's option list and numeric index are folded into `choice`.
  if (node.class_type === "CustomCombo" && (inputKey === "index" || /^option\d+$/.test(inputKey))) {
    return false;
  }
  if (isCurveValue(value)) return true;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Whether a widget value is a tone curve.
 *
 * Structural, not nominal: the check is on the shape rather than the declaring
 * class, so a `CURVE` widget on any node — core `CurveEditor` or a pack's own —
 * is recognised without the catalog being reachable.
 */
export function isCurveValue(value: unknown): value is ComfyCurve {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const points = (value as { points?: unknown }).points;
  return (
    Array.isArray(points) &&
    points.length >= 2 &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number"
    )
  );
}

/* ── patching ──────────────────────────────────────────────────── */

export interface PatchGraphParams {
  /**
   * Media bindings: each loader node's upload widget set to a filename the
   * engine already holds (or an asset handle the SDK will substitute).
   */
  media: Array<{ nodeId: string; inputKey: string; value: unknown }>;
  /** Widget assignments: nodeId + inputKey → value. */
  assignments: Array<{ nodeId: string; inputKey: string; value: unknown }>;
  /** Output nodes to keep — preview sinks among them are rewritten to savers. */
  outputNodeIds: string[];
  /**
   * A token unique to this run, appended to each bound sink's `filename_prefix`.
   *
   * ComfyUI caches every node's result by the signature of its inputs, so
   * submitting a graph the engine has already executed re-runs nothing — and a
   * job that executes nothing emits no outputs at all, which is
   * indistinguishable from a workflow whose sink is broken. Re-running an
   * unchanged app node, or running two nodes that resolve to the same graph,
   * therefore fails on the *second* attempt and every one after it.
   *
   * Giving the sink a filename it has never written makes exactly that one node
   * miss the cache. Everything upstream still hits it, so the result is
   * produced without paying to regenerate it.
   */
  runTag?: string;
  /**
   * Seed applied to every seed-shaped numeric input the user did not pin.
   * Omit to leave the graph's own seeds untouched.
   */
  seed?: number;
  /** Seed inputs the user explicitly set — never overwritten by `seed`. */
  pinnedSeeds?: Array<{ nodeId: string; inputKey: string }>;
}

/**
 * Produce a runnable copy of a graph with its inputs, parameters and outputs
 * bound for one run.
 *
 * Mutations, in order: media bindings, widget assignments, seed randomisation,
 * preview→save rewrites, and the `CustomCombo` index re-derivation (a headless
 * run has no frontend to keep `choice` and `index` in sync, so picking an
 * option would otherwise still run whichever index was last saved).
 */
export function patchGraph(graph: ComfyGraph, params: PatchGraphParams): ComfyGraph {
  const patched: ComfyGraph = structuredClone(graph);

  for (const { nodeId, inputKey, value } of params.media) {
    const node = patched[nodeId];
    if (!node) throw new Error(`Bound input node ${nodeId} is missing from the workflow`);
    node.inputs[inputKey] = value;
  }

  const pinned = new Set(
    (params.pinnedSeeds ?? []).map(({ nodeId, inputKey }) => `${nodeId}:${inputKey}`)
  );
  for (const { nodeId, inputKey, value } of params.assignments) {
    const node = patched[nodeId];
    if (!node) continue;
    const current = node.inputs[inputKey];
    // Coerce to the shape the graph already holds so a string "7" from a form
    // control doesn't turn a numeric widget into text.
    if (typeof current === "number" && typeof value !== "number") {
      const num = Number(value);
      node.inputs[inputKey] = Number.isFinite(num) ? num : current;
    } else if (typeof current === "boolean" && typeof value !== "boolean") {
      node.inputs[inputKey] = value === "true" || value === true;
    } else {
      node.inputs[inputKey] = value;
    }
  }

  if (params.seed !== undefined) {
    for (const [nodeId, node] of Object.entries(patched)) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (typeof value !== "number") continue;
        if (!isSeedKey(key)) continue;
        if (pinned.has(`${nodeId}:${key}`)) continue;
        node.inputs[key] = params.seed;
      }
    }
  }

  for (const nodeId of params.outputNodeIds) {
    const node = patched[nodeId];
    if (!node) continue;
    const replacement = PREVIEW_TO_SAVE[node.class_type];
    if (replacement) {
      node.class_type = replacement;
      node.inputs = { images: node.inputs.images, filename_prefix: "node-banana" };
    }
    // Sinks that name their own file get a fresh one per run — see `runTag`.
    // A sink with no `filename_prefix` (a text or 3D preview) has nothing safe
    // to vary, so it keeps whatever the author saved.
    if (params.runTag && typeof node.inputs.filename_prefix === "string") {
      node.inputs.filename_prefix = `${node.inputs.filename_prefix}_${params.runTag}`;
    }
  }

  for (const node of Object.values(patched)) {
    if (node.class_type !== "CustomCombo") continue;
    const choice = node.inputs.choice;
    if (typeof choice !== "string") continue;
    const options = Object.entries(node.inputs)
      .filter((e): e is [string, string] => /^option\d+$/.test(e[0]) && typeof e[1] === "string")
      .sort((a, b) => Number(a[0].slice(6)) - Number(b[0].slice(6)))
      .map(([, v]) => v);
    const index = options.indexOf(choice);
    if (index >= 0) node.inputs.index = index;
  }

  return patched;
}

/**
 * Drop the branches of a graph that no kept output depends on.
 *
 * An app node binds only the outputs the author exposed; leaving the rest in
 * place would make the engine execute (and bill for) work whose results are
 * thrown away. Sinks that are not kept are removed, then anything no longer
 * reachable from a kept sink is pruned.
 */
export function pruneToOutputs(graph: ComfyGraph, keepNodeIds: string[]): ComfyGraph {
  const keep = new Set(keepNodeIds.filter((id) => graph[id]));
  if (keep.size === 0) return structuredClone(graph);

  const reachable = new Set<string>();
  const stack = [...keep];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = graph[id];
    if (!node) continue;
    for (const value of Object.values(node.inputs)) {
      if (isLink(value)) {
        stack.push(value[0]);
      } else if (Array.isArray(value)) {
        // Some packs pass lists of links (batched inputs).
        for (const item of value) if (isLink(item)) stack.push(item[0]);
      }
    }
  }

  const pruned: ComfyGraph = {};
  for (const [id, node] of Object.entries(graph)) {
    if (reachable.has(id)) pruned[id] = structuredClone(node);
  }
  return pruned;
}

/* ── output collection ─────────────────────────────────────────── */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|opus|m4a)$/i;
const MODEL_EXT = /\.(glb|gltf|usdz|obj|ply|stl|splat|spz)$/i;

/** Best-effort media type for a produced file, from its extension. */
export function mediaTypeForFilename(filename: string): ComfyOutputType {
  if (MODEL_EXT.test(filename)) return "3d";
  if (VIDEO_EXT.test(filename)) return "video";
  if (AUDIO_EXT.test(filename)) return "audio";
  return "image";
}

/** MIME type for a produced file, from its extension. */
export function mimeForFilename(filename: string, fallback = "image/png"): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const table: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    m4a: "audio/mp4",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    usdz: "model/vnd.usdz+zip",
    // A gaussian splat is saved as one of these. Missing, they fell through to
    // the image fallback, and a 23MB splat arrived labelled `image/png` — the
    // node would try to render a point cloud as a picture.
    obj: "model/obj",
    stl: "model/stl",
    ply: "model/ply",
    splat: "application/octet-stream",
    spz: "application/octet-stream",
    txt: "text/plain",
    json: "application/json",
  };
  return table[ext] ?? fallback;
}
