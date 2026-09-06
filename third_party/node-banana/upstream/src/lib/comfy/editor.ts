/**
 * ComfyUI editor-format (save-format) support.
 *
 * The editor format is what ComfyUI's normal Save produces, and the only
 * format that carries **App Mode** (linear mode) configuration — the author's
 * curated list of inputs and outputs. It is not executable: widget values are
 * stored positionally (`widgets_values`), without names. Converting to the
 * executable API format therefore needs a node catalog (`/object_info` from a
 * reachable engine) to map positions onto named inputs.
 *
 * Subgraphs (a.k.a. Blueprints) are expanded inline, with inner node ids
 * namespaced as `instance:inner` — matching ComfyUI's own API export.
 */

import { PLACEHOLDER_IMAGE, PLACEHOLDER_AUDIO, PLACEHOLDER_VIDEO } from "./graph";
import type {
  ComfyBlueprintSummary,
  ComfyGraph,
  ComfyGraphNode,
  ComfyInputType,
  ComfyObjectInfo,
} from "./types";

/* ── editor file shapes ────────────────────────────────────────── */

interface EditorNodeInput {
  name: string;
  type?: string;
  link?: number | null;
  widget?: { name?: string };
  /** The author's display rename for this socket or promoted widget. */
  label?: string;
}

interface EditorNode {
  id: number | string;
  type: string;
  title?: string;
  /** 0 = normal, 2 = muted, 4 = bypassed. */
  mode?: number;
  inputs?: EditorNodeInput[];
  outputs?: Array<{ name?: string; type?: string }>;
  widgets_values?: unknown[] | Record<string, unknown>;
}

type EditorLinkTuple = [number, number | string, number, number | string, number, ...unknown[]];
interface EditorLinkObject {
  id: number;
  origin_id: number | string;
  origin_slot: number;
  target_id: number | string;
  target_slot: number;
}
type EditorLink = EditorLinkTuple | EditorLinkObject;

/** A subgraph definition — an inner graph with declared boundary slots. */
export interface SubgraphDef {
  id: string;
  name?: string;
  nodes: EditorNode[];
  links?: EditorLink[];
  /** Boundary inputs, in slot order; `linkIds` are the inner links they feed. */
  inputs?: Array<{ name?: string; type?: string; linkIds?: number[] | null }>;
  /** Boundary outputs, in slot order; `linkIds` are the inner links feeding them. */
  outputs?: Array<{ name?: string; type?: string; linkIds?: number[] | null }>;
}

export interface EditorWorkflowFile {
  nodes: EditorNode[];
  links?: EditorLink[];
  definitions?: { subgraphs?: SubgraphDef[] };
  extra?: {
    linearMode?: boolean;
    linearData?: {
      inputs?: Array<[string | number, string, ...unknown[]]>;
      outputs?: Array<string | number | { id?: string | number; nodeId?: string | number }>;
    };
    /** Newer exports may nest the same data under `appMode`. */
    appMode?: {
      inputs?: Array<[string | number, string, ...unknown[]]>;
      outputs?: Array<string | number | { id?: string | number; nodeId?: string | number }>;
    };
  };
}

/** Whether a parsed JSON blob is an editor save rather than an API graph. */
export function isEditorFormat(raw: unknown): raw is EditorWorkflowFile {
  return raw !== null && typeof raw === "object" && Array.isArray((raw as { nodes?: unknown }).nodes);
}

/* ── widget-value mapping ──────────────────────────────────────── */

/**
 * Nodes that exist only for the editor canvas — never part of execution.
 *
 * `PrimitiveNode` is the classic frontend-*virtual* node: it has no backend
 * implementation and never appears in `/api/object_info`, because the frontend
 * resolves it at prompt time by pushing its widget value into the input it
 * feeds. Treating its absence from the catalog as a missing custom node made us
 * refuse whole workflows. Note this is the bare `PrimitiveNode` only — the
 * typed `PrimitiveInt` / `PrimitiveString` / `PrimitiveFloat` / `PrimitiveBoolean`
 * nodes are real, execute on the backend, and must keep being emitted.
 */
const COSMETIC_TYPES = new Set(["Note", "MarkdownNote", "Reroute", "PrimitiveNode"]);

const SEED_CONTROL_VALUES = new Set(["fixed", "increment", "decrement", "randomize"]);

/** A widget spec is `[type, options?]`; read the options object safely. */
function specOptions(spec: unknown[]): Record<string, unknown> {
  return (spec[1] && typeof spec[1] === "object" ? spec[1] : {}) as Record<string, unknown>;
}

/**
 * The engine's default for a widget — used to fill a *required* widget the
 * editor save omitted. The frontend always sends a value, so the engine
 * expects one; leaving it out fails validation.
 */
function widgetDefault(spec: unknown[]): unknown {
  const type = spec[0];
  const opts = specOptions(spec);
  if ("default" in opts) return opts.default;
  if (Array.isArray(type)) return type[0];
  if (type === "COMBO") {
    const options = Array.isArray(opts.options) ? opts.options : [];
    return options[0];
  }
  // A V3 dynamic combo's value is the selected option's *key*, and no such
  // input in the catalog declares a `default` — so the frontend's initial
  // selection, the first option, is the only default there is. Omitting one is
  // not caught by validation: the engine binds required inputs positionally, so
  // the job is accepted, the model runs, and the save step then dies with
  // "missing 1 required positional argument".
  if (typeof type === "string" && type.startsWith("COMFY_DYNAMICCOMBO_")) {
    const options = Array.isArray(opts.options) ? opts.options : [];
    const first = options[0];
    return first !== null && typeof first === "object" ? (first as { key?: unknown }).key : first;
  }
  if (type === "INT" || type === "FLOAT") return 0;
  if (type === "STRING") return "";
  if (type === "BOOLEAN") return false;
  return undefined;
}

interface SpecInputGroups {
  required?: Record<string, unknown>;
  optional?: Record<string, unknown>;
}

/** Input specs of a node (or dynamic-combo option), in declaration order. */
function specEntries(input: SpecInputGroups | undefined): Array<{ name: string; spec: unknown[] }> {
  const all = { ...(input?.required ?? {}), ...(input?.optional ?? {}) };
  return Object.entries(all)
    .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .map(([name, spec]) => ({ name, spec }));
}

/**
 * Map positional `widgets_values` onto named inputs by walking the node spec
 * in declaration order — mirroring the frontend's widget instantiation.
 *
 * V3 dynamic schemas: a `COMFY_DYNAMICCOMBO_*` input is a widget whose value is
 * the selected option key; the option's nested inputs follow immediately after
 * it and serialize under dotted names (`model.aspect_ratio`).
 * `COMFY_AUTOGROW_*` / `COMFY_MATCHTYPE_*` groups create input sockets only —
 * they consume no widget values.
 */
function assignWidgetValues(
  inputs: Record<string, unknown>,
  entries: Array<{ name: string; spec: unknown[] }>,
  values: unknown[],
  state: { i: number },
  connectionNames: Set<string>,
  prefix = ""
): void {
  for (const { name, spec } of entries) {
    const type = spec[0];
    const opts = specOptions(spec);

    if (typeof type === "string" && type.startsWith("COMFY_DYNAMICCOMBO_")) {
      if (state.i >= values.length) return;
      const selected = values[state.i];
      state.i += 1;
      inputs[`${prefix}${name}`] = selected;
      const options = Array.isArray(opts.options) ? opts.options : [];
      const option = options.find(
        (o): o is { key: unknown; inputs?: SpecInputGroups } =>
          o !== null && typeof o === "object" && (o as { key?: unknown }).key === selected
      );
      if (option?.inputs) {
        assignWidgetValues(
          inputs,
          specEntries(option.inputs),
          values,
          state,
          connectionNames,
          `${prefix}${name}.`
        );
      }
      continue;
    }

    if (
      typeof type === "string" &&
      (type.startsWith("COMFY_AUTOGROW_") || type.startsWith("COMFY_MATCHTYPE_"))
    ) {
      continue;
    }

    // A connection consumes no widgets_values slot. It's a connection if the
    // node lists it as a real input slot, or the spec forces it. Everything
    // else is a widget — including custom widgets like curve editors.
    const fullName = `${prefix}${name}`;
    if (connectionNames.has(fullName) || opts.forceInput === true) continue;
    if (state.i >= values.length) return;

    // Arrays as widget values would read as links — wrap like the frontend.
    inputs[fullName] = Array.isArray(values[state.i])
      ? { __value__: values[state.i] }
      : values[state.i];
    state.i += 1;

    // Seed widgets serialize a companion control value ("randomize", …).
    const seedLike = Boolean(opts.control_after_generate) || name === "seed" || name === "noise_seed";
    if (
      seedLike &&
      typeof values[state.i] === "string" &&
      SEED_CONTROL_VALUES.has(values[state.i] as string)
    ) {
      state.i += 1;
    }
    // Upload widgets serialize a trailing pseudo-value.
    if (opts.image_upload === true && values[state.i] === "image") state.i += 1;
  }
}

/**
 * `CustomCombo` (the author-defined dropdown) carries dynamic `option1..optionN`
 * widgets the engine's static schema only partially declares, so the generic
 * spec-driven mapping drops options past the first few. Map them all directly
 * from the positional values (`[choice, index, option1, option2, …]`) so every
 * choice stays selectable — and so the dropdown surfaces even when no reachable
 * engine knows `CustomCombo`.
 */
function assignCustomComboValues(inputs: Record<string, unknown>, values: unknown[]): void {
  if (values.length > 0) inputs.choice = values[0];
  if (values.length > 1) inputs.index = values[1];
  let n = 1;
  for (let k = 2; k < values.length; k += 1) {
    const v = values[k];
    if (typeof v === "string" && v.trim() === "") continue;
    inputs[`option${n}`] = v;
    n += 1;
  }
}

/* ── link resolution across subgraph boundaries ────────────────── */

interface NormalizedLink {
  origin: string;
  originSlot: number;
}

function normalizeLinks(links: EditorLink[] | undefined): Map<number, NormalizedLink> {
  const map = new Map<number, NormalizedLink>();
  for (const link of links ?? []) {
    if (Array.isArray(link)) {
      map.set(link[0], { origin: String(link[1]), originSlot: link[2] });
    } else if (link && typeof link === "object") {
      map.set(link.id, { origin: String(link.origin_id), originSlot: link.origin_slot });
    }
  }
  return map;
}

/**
 * One graph level: the root workflow, or a subgraph instance's inner graph.
 * Inner nodes get namespaced ids (`instance:inner`).
 */
interface Scope {
  prefix: string;
  nodes: Map<string, EditorNode>;
  links: Map<number, NormalizedLink>;
  /** Inner link id → boundary input slot it originates from. */
  boundaryOwner: Map<number, number>;
  /** Boundary input name → promoted widget value on the instance. */
  boundaryWidgetValue: Map<string, unknown>;
  instance: EditorNode | null;
  def: SubgraphDef | null;
  parent: Scope | null;
  /** Child scopes keyed by the instance node id within this scope. */
  children: Map<string, Scope>;
}

type Resolved = { kind: "link"; key: string; slot: number } | { kind: "value"; value: unknown };

function buildScope(
  nodes: EditorNode[],
  links: EditorLink[] | undefined,
  defs: Map<string, SubgraphDef>,
  prefix: string,
  parent: Scope | null,
  instance: EditorNode | null,
  def: SubgraphDef | null,
  depth: number
): Scope {
  if (depth > 10) {
    throw new Error("Subgraphs nest too deeply (or recursively) to convert");
  }
  const scope: Scope = {
    prefix,
    nodes: new Map(nodes.map((n) => [String(n.id), n])),
    links: normalizeLinks(links),
    boundaryOwner: new Map(),
    boundaryWidgetValue: new Map(),
    instance,
    def,
    parent,
    children: new Map(),
  };
  for (const [slot, input] of (def?.inputs ?? []).entries()) {
    for (const linkId of input.linkIds ?? []) scope.boundaryOwner.set(linkId, slot);
  }
  // Promoted widget values, keyed by the boundary slot they belong to.
  //
  // They are stored positionally, and the list they are positional *against* is
  // the definition's own slots — not the instance's `inputs`. The instance
  // materialises only the slots the author wired or touched, so the two lists
  // routinely differ in length and order. One published workflow carries nine
  // values beside four materialised inputs, and zipping against the latter put
  // the prompt into `width`, `1344` into `height`, and left five slots unset.
  if (instance && Array.isArray(instance.widgets_values)) {
    const values = instance.widgets_values;
    widgetBackedSlots(def).forEach((name, index) => {
      if (index < values.length) scope.boundaryWidgetValue.set(name, values[index]);
    });
  }
  for (const node of nodes) {
    const childDef = defs.get(String(node.type));
    if (childDef) {
      scope.children.set(
        String(node.id),
        buildScope(
          childDef.nodes,
          childDef.links,
          defs,
          `${prefix}${node.id}:`,
          scope,
          node,
          childDef,
          depth + 1
        )
      );
    }
  }
  return scope;
}

/**
 * The boundary input slots that carry a widget value, in declaration order.
 *
 * A slot fed into a socket takes its value from a link and has no widget; one
 * fed into a widget is a promoted control, and it is exactly these — in this
 * order — that an instance's `widgets_values` lines up against.
 */
function widgetBackedSlots(def: SubgraphDef | null | undefined): string[] {
  const nodes = new Map((def?.nodes ?? []).map((n) => [String(n.id), n]));
  const targets = linkTargets(def?.links);
  const names: string[] = [];
  for (const slot of def?.inputs ?? []) {
    if (!slot.name) continue;
    const backed = (slot.linkIds ?? []).some((linkId) => {
      const target = targets.get(linkId);
      return target ? Boolean(nodes.get(target.target)?.inputs?.[target.slot]?.widget) : false;
    });
    if (backed) names.push(slot.name);
  }
  return names;
}

function resolveLinkId(scope: Scope, linkId: number, depth: number): Resolved | null {
  if (depth > 100) return null;
  // Links originating at a boundary input resolve in the parent scope.
  const boundarySlot = scope.boundaryOwner.get(linkId);
  if (boundarySlot !== undefined) {
    // Match the instance's input BY NAME — instances materialize only the
    // boundary inputs the author touched, so indexes don't line up.
    const boundaryName = scope.def?.inputs?.[boundarySlot]?.name;
    const outer = boundaryName
      ? (scope.instance?.inputs ?? []).find((i) => i.name === boundaryName)
      : scope.instance?.inputs?.[boundarySlot];
    if (outer?.link != null && scope.parent) {
      return resolveLinkId(scope.parent, outer.link, depth + 1);
    }
    const value = boundaryName ? scope.boundaryWidgetValue.get(boundaryName) : undefined;
    if (value !== undefined && value !== null) return { kind: "value", value };
    return null; // unconnected optional input — inner defaults apply
  }
  const link = scope.links.get(linkId);
  if (!link) return null;
  return resolveOrigin(scope, link.origin, link.originSlot, depth);
}

function resolveOrigin(
  scope: Scope,
  originId: string,
  slot: number,
  depth: number
): Resolved | null {
  if (depth > 100) return null;
  // Source is a subgraph instance: follow its boundary output inward.
  const child = scope.children.get(originId);
  if (child) {
    const innerLinkId = child.def?.outputs?.[slot]?.linkIds?.[0];
    if (innerLinkId == null) return null;
    return resolveLinkId(child, innerLinkId, depth + 1);
  }
  const node = scope.nodes.get(originId);
  if (!node) return null;
  if (node.type === "Reroute") {
    const upstream = node.inputs?.[0]?.link;
    return upstream == null ? null : resolveLinkId(scope, upstream, depth + 1);
  }
  if (node.type === "PrimitiveNode") {
    // A primitive holds a literal, not a result: the frontend writes its value
    // straight into the widget it feeds. Emitting a link here would point at a
    // node the engine has never heard of.
    const value = Array.isArray(node.widgets_values) ? node.widgets_values[0] : undefined;
    return value === undefined ? null : { kind: "value", value };
  }
  if (node.mode === 4) {
    // Bypassed: route through, mirroring the frontend's slot matching —
    // wildcard prefers the same slot, then same-slot type match, then the
    // first input of the exact type.
    const outType = node.outputs?.[slot]?.type;
    const inputs = node.inputs ?? [];
    const compatible = (a?: string, b?: string) => !a || !b || a === b || a === "*" || b === "*";
    let match: EditorNodeInput | undefined;
    if (outType === "*" || outType === "" || outType === undefined) {
      match = inputs[slot] ?? inputs[0];
    } else if (inputs[slot] && compatible(inputs[slot].type, outType)) {
      match = inputs[slot];
    } else {
      match =
        inputs.find((i) => i.type === outType) ?? inputs.find((i) => compatible(i.type, outType));
    }
    return match?.link != null ? resolveLinkId(scope, match.link, depth + 1) : null;
  }
  if (node.mode === 2) return null; // muted — produces nothing
  return { kind: "link", key: `${scope.prefix}${originId}`, slot };
}

/* ── conversion ────────────────────────────────────────────────── */

export class ComfyConversionError extends Error {
  /** Node type the converter could not interpret, when that was the cause. */
  readonly unknownNodeType?: string;
  constructor(message: string, unknownNodeType?: string) {
    super(message);
    this.name = "ComfyConversionError";
    if (unknownNodeType) this.unknownNodeType = unknownNodeType;
  }
}

/**
 * Convert an editor-format workflow into an executable API graph, expanding
 * subgraphs.
 *
 * @throws {ComfyConversionError} when a node's widget layout cannot be
 * interpreted because no reachable engine declares its schema.
 */
export function convertEditorGraph(
  file: EditorWorkflowFile,
  objectInfo: ComfyObjectInfo
): ComfyGraph {
  const defs = new Map<string, SubgraphDef>();
  for (const def of file.definitions?.subgraphs ?? []) defs.set(String(def.id), def);

  const root = buildScope(file.nodes, file.links, defs, "", null, null, null, 0);
  const graph: ComfyGraph = {};

  function emitScope(scope: Scope): void {
    for (const node of scope.nodes.values()) {
      const id = String(node.id);
      if (node.mode === 2 || node.mode === 4) continue; // muted / bypassed
      const child = scope.children.get(id);
      if (child) {
        emitScope(child);
        continue;
      }
      if (COSMETIC_TYPES.has(node.type)) continue;

      const api: ComfyGraphNode = {
        class_type: node.type,
        inputs: {},
        ...(node.title ? { _meta: { title: node.title } } : {}),
      };

      // The node's own input slots are connections — only widgets consume a
      // widgets_values slot. A widget converted to an input carries a `widget`
      // flag and still has a value, so it is excluded from the connection set.
      const connectionNames = new Set(
        (node.inputs ?? []).filter((inp) => !inp.widget).map((inp) => inp.name)
      );

      const values = node.widgets_values;
      if (node.type === "CustomCombo" && Array.isArray(values)) {
        assignCustomComboValues(api.inputs, values);
      } else if (values && !Array.isArray(values) && typeof values === "object") {
        // Some packs (VHS) serialize widgets as a named object already. Keep
        // object values too (custom widgets) — only arrays must be wrapped so
        // they are not mistaken for a `[node, slot]` link.
        for (const [key, value] of Object.entries(values)) {
          if (value === null) continue;
          api.inputs[key] = Array.isArray(value) ? { __value__: value } : value;
        }
      } else if (Array.isArray(values) && values.length > 0) {
        if (!objectInfo[node.type]) {
          throw new ComfyConversionError(
            `No reachable ComfyUI knows the node "${node.type}", so this workflow cannot be interpreted. Install its node pack on the engine you selected, or import an API-format export instead.`,
            node.type
          );
        }
        assignWidgetValues(
          api.inputs,
          specEntries(objectInfo[node.type]?.input),
          values,
          { i: 0 },
          connectionNames
        );
      }

      // Connections override widget placeholders.
      for (const input of node.inputs ?? []) {
        if (input.link == null) continue;
        const resolved = resolveLinkId(scope, input.link, 0);
        if (resolved?.kind === "link") api.inputs[input.name] = [resolved.key, resolved.slot];
        else if (resolved?.kind === "value") api.inputs[input.name] = resolved.value;
      }

      // Required widgets the editor save omitted get the engine's default —
      // the frontend always sends one, so the engine expects one.
      for (const [name, spec] of Object.entries(objectInfo[node.type]?.input?.required ?? {})) {
        if (!Array.isArray(spec) || name in api.inputs || connectionNames.has(name)) continue;
        const opts = specOptions(spec);
        if (opts.forceInput === true) continue;
        const fallback = widgetDefault(spec);
        if (fallback !== undefined) api.inputs[name] = fallback;
      }

      graph[`${scope.prefix}${id}`] = api;
    }
  }
  emitScope(root);

  // Final prune (mirrors the frontend): drop link inputs that reference nodes
  // excluded from the prompt (muted / bypassed / virtual).
  for (const node of Object.values(graph)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && typeof value[0] === "string" && !graph[value[0]]) {
        delete node.inputs[key];
      }
    }
  }

  if (Object.keys(graph).length === 0) {
    throw new ComfyConversionError("No executable nodes found in this workflow");
  }
  return graph;
}

/**
 * Node types referenced by an editor save whose widget layout must be looked
 * up in a catalog. Used to decide whether a conversion can succeed before
 * attempting it, and to report exactly what an engine is missing.
 */
export function editorNodeTypes(file: EditorWorkflowFile): string[] {
  const types = new Set<string>();
  const defs = new Set((file.definitions?.subgraphs ?? []).map((d) => String(d.id)));
  const walk = (nodes: EditorNode[]): void => {
    for (const node of nodes) {
      if (node.mode === 2 || node.mode === 4) continue;
      const type = String(node.type);
      if (defs.has(type) || COSMETIC_TYPES.has(type)) continue;
      types.add(type);
    }
  };
  walk(file.nodes);
  for (const def of file.definitions?.subgraphs ?? []) walk(def.nodes);
  return [...types].sort();
}

/* ── App Mode ──────────────────────────────────────────────────── */

export interface AppModeData {
  /**
   * Author-exposed inputs, in display order. `nodeId` is already namespaced the
   * way {@link convertEditorGraph} emits it (`instance:inner` for a widget
   * inside a subgraph), so it indexes straight into the converted API graph.
   */
  inputs: Array<{
    nodeId: string;
    widget: string;
    /** The author's display rename, when the format carries one. */
    label?: string;
    /**
     * Further widgets this one control also sets.
     *
     * A blueprint boundary slot may feed several inner nodes — one `ckpt_name`
     * into a checkpoint loader, a VAE loader and a text-encoder loader. They are
     * one choice to the author and must stay one choice here, or the user can
     * change the model and leave its VAE behind.
     */
    alsoBind?: Array<{ nodeId: string; widget: string }>;
    /**
     * Force this widget onto a connectable handle of the given type.
     *
     * Set when the author declared it as a boundary *input* of the blueprint,
     * which says outright that it is meant to be fed from outside — a stronger
     * signal than the name-shaped guess {@link import("./graph").isPromptWidget}
     * makes, which only recognises prompts.
     */
    connectAs?: ComfyInputType;
  }>;
  /** Author-exposed output node ids, in order. */
  outputNodeIds: string[];
}

/** Normalise an App Mode output entry, which may be an id or an object. */
function outputEntryId(entry: unknown): string | null {
  if (typeof entry === "string" || typeof entry === "number") return String(entry);
  if (entry && typeof entry === "object") {
    const obj = entry as { id?: unknown; nodeId?: unknown };
    if (obj.id !== undefined) return String(obj.id);
    if (obj.nodeId !== undefined) return String(obj.nodeId);
  }
  return null;
}

/**
 * Resolve element `[0]` of a `linearData.inputs` tuple to a node id.
 *
 * The frontend has migrated this field twice, and all three encodings are
 * still found in the wild:
 *
 * - a bare node id (`"3"`) — the original form;
 * - a legacy `"<nodeId>:<subNodeId>"` pair;
 * - a `WidgetId`: `"<graphId>:<nodeId>:<widgetName>"`, whose node-id and name
 *   segments are `encodeURIComponent`-escaped.
 *
 * Returns the node id plus, for the `WidgetId` form, the widget name it
 * carries. That name is a *fallback*: element `[1]` of the tuple is the field
 * the frontend writes when it renames or re-promotes a control, and it is also
 * the boundary slot name that {@link promotedBindings} needs when the id turns
 * out to name a subgraph instance. The name inside the id is only reached when
 * element `[1]` is absent.
 */
export function parseAppModeInputId(
  raw: unknown
): { nodeId: string; widget?: string } | null {
  if (typeof raw === "number") return { nodeId: String(raw) };
  if (typeof raw !== "string" || raw === "") return null;
  if (!raw.includes(":")) return { nodeId: raw };

  const segments = raw.split(":");
  const decode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if (segments.length >= 3) {
    // graphId : nodeId : widgetName — the graph id is the subgraph the node
    // lives in, which is exactly the prefix the converter namespaces with.
    return { nodeId: decode(segments[1]!), widget: decode(segments[2]!) };
  }
  // A legacy pair addresses a node inside a subgraph instance; the converter
  // emits those as `instance:inner`, so the pair maps across unchanged.
  return { nodeId: segments.map(decode).join(":") };
}

/**
 * Read App Mode (linear mode) configuration from an editor export.
 *
 * App Mode is treated as on unless *explicitly* disabled: the frontend's only
 * writer sets `extra.linearData` and never `extra.linearMode`, so requiring
 * `linearMode === true` would silently discard a modern author's curated
 * surface.
 *
 * Entries are matched against the ids the conversion actually produced, so a
 * reference to a deleted (or muted, or bypassed) node is dropped rather than
 * becoming a dead handle. Pass `knownNodeIds` from the converted graph; without
 * it only root-level nodes can be validated.
 */
/**
 * Where a widget promoted onto a subgraph instance actually lives.
 *
 * The author sees one control on the subgraph node; the graph has no such node
 * once conversion expands it. `widget` names the boundary slot, and the control
 * belongs to every inner input that slot drives — usually one, occasionally
 * several, in which case they move together as a single setting.
 */
function promotedBindings(
  file: EditorWorkflowFile,
  instanceNodeId: string,
  widget: string
): AppModeData["inputs"] {
  const instance = (file.nodes ?? []).find((n) => String(n.id) === instanceNodeId);
  if (!instance) return [];
  const def = (file.definitions?.subgraphs ?? []).find(
    (d) => String(d.id) === String(instance.type)
  );
  if (!def) return [];

  const [primary, ...rest] = resolveProxied(
    file,
    def,
    instanceNodeId,
    BOUNDARY_SLOT_ID,
    widget
  );
  if (!primary) return [];

  const slot = (def.inputs ?? []).find((s) => s.name === widget);
  const label = slot ? slotLabel(slot, widget) : widget;
  return [
    {
      nodeId: primary.nodeId,
      widget: primary.widget,
      ...(label ? { label } : {}),
      ...(slot?.type === "STRING" ? { connectAs: "text" as const } : {}),
      ...(rest.length > 0 ? { alsoBind: rest } : {}),
    },
  ];
}

export function extractAppMode(
  file: EditorWorkflowFile,
  knownNodeIds?: Iterable<string>
): AppModeData | null {
  const data = file.extra?.linearData ?? file.extra?.appMode;
  if (file.extra?.linearMode === false || !data) return null;

  const ids = knownNodeIds ? new Set(knownNodeIds) : new Set(file.nodes.map((n) => String(n.id)));

  /**
   * Resolve an id against the ids conversion produced.
   *
   * An exact match always wins. A `WidgetId` carries only the inner id of a
   * node inside a subgraph, which the converter emitted as `instance:inner`,
   * so a suffix match is the fallback — but only when it is UNAMBIGUOUS.
   * Node id "5" would otherwise match "140:5" and "77:5" alike, and binding
   * the author's selection to the wrong node is worse than dropping it.
   */
  const resolveId = (candidate: string): string | undefined => {
    if (ids.has(candidate)) return candidate;
    const suffix = `:${candidate}`;
    const matches = [...ids].filter((id) => id.endsWith(suffix));
    return matches.length === 1 ? matches[0] : undefined;
  };

  const inputs: AppModeData["inputs"] = [];
  for (const entry of data.inputs ?? []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const parsed = parseAppModeInputId(entry[0]);
    if (!parsed) continue;
    const widget = String(entry[1] ?? parsed.widget ?? "");
    if (!widget) continue;
    const nodeId = resolveId(parsed.nodeId);
    if (!nodeId) {
      // The id may name a subgraph *instance*, which conversion expands away —
      // so it matches nothing in the graph, and the author's control was being
      // dropped without a word. The widget is then a boundary slot name, and
      // the control belongs to whatever that slot drives inside.
      for (const binding of promotedBindings(file, parsed.nodeId, widget)) {
        if (inputs.some((i) => i.nodeId === binding.nodeId && i.widget === binding.widget)) continue;
        inputs.push(binding);
      }
      continue;
    }
    if (inputs.some((i) => i.nodeId === nodeId && i.widget === widget)) continue;
    inputs.push({ nodeId, widget });
  }

  const outputNodeIds: string[] = [];
  for (const entry of data.outputs ?? []) {
    const id = outputEntryId(entry);
    if (id === null) continue;
    const nodeId = resolveId(id);
    if (nodeId && !outputNodeIds.includes(nodeId)) outputNodeIds.push(nodeId);
  }

  if (inputs.length === 0 && outputNodeIds.length === 0) return null;
  return { inputs, outputNodeIds };
}

/* ── blueprints ────────────────────────────────────────────────── */

/**
 * A ComfyUI **Blueprint** is a saved subgraph, serialized as an ordinary
 * editor-format workflow: `definitions.subgraphs[0]` holds the reusable graph,
 * and the root `nodes` array holds a single *instance* node whose `type` is
 * that subgraph's id.
 *
 * Its exposed surface comes from two places, and both are needed:
 *
 * - **Connectable slots** — `definitions.subgraphs[i].inputs/outputs`, mirrored
 *   onto the instance node's `inputs`/`outputs`.
 * - **Promoted widgets** — `instance.properties.proxyWidgets`, an array of
 *   `[innerNodeId, widgetName]` tuples. These are the blueprint's tunable
 *   parameters, and there are usually more of them than there are slots.
 */
interface BlueprintInstanceNode extends EditorNode {
  properties?: { proxyWidgets?: Array<[string | number, string]> };
}

/** The root node that instantiates a given subgraph definition, if present. */
function blueprintInstance(
  file: EditorWorkflowFile,
  subgraphId: string
): BlueprintInstanceNode | null {
  return (
    (file.nodes as BlueprintInstanceNode[]).find((n) => String(n.type) === subgraphId) ?? null
  );
}

/** Display label for a boundary slot: the author's rename, else its name. */
function slotLabel(
  slot: { name?: string; label?: string } | undefined,
  fallback: string
): string {
  const withLabel = slot as { label?: string } | undefined;
  return withLabel?.label?.trim() || slot?.name?.trim() || fallback;
}

/**
 * Summarise the subgraph definitions carried by a workflow file.
 *
 * A subgraph declares boundary input and output slots, which is most of the
 * contract an app node needs — so each one can be offered as a ready-made node
 * without the user hand-picking anything.
 */
export function extractBlueprints(file: EditorWorkflowFile): ComfyBlueprintSummary[] {
  // Blueprint authors describe their subgraph in `extra`, alongside search
  // aliases — the only metadata the format carries beyond the name.
  const rawDescription = (file.extra as { BlueprintDescription?: unknown } | undefined)
    ?.BlueprintDescription;
  const description = typeof rawDescription === "string" ? rawDescription.trim() : undefined;

  return (file.definitions?.subgraphs ?? []).map((def, index) => {
    const instance = blueprintInstance(file, String(def.id));
    return {
      id: String(def.id),
      name: def.name?.trim() || instance?.title?.trim() || `Blueprint ${index + 1}`,
      ...(description ? { description } : {}),
      inputNames: (def.inputs ?? []).map((slot, n) => slotLabel(slot, `input_${n}`)),
      outputNames: (def.outputs ?? []).map((slot, n) => slotLabel(slot, `output_${n}`)),
      nodeCount: def.nodes.length,
      source: "workflow" as const,
    };
  });
}

/**
 * How to persist a value of a given boundary-slot type.
 *
 * `widgets` are the sink's own positional widget values *after* the connected
 * input, in the order the engine declares them. They are spelled out rather
 * than left to defaults because a required widget with no declared default —
 * `SaveVideo.codec`, a `COMFY_DYNAMICCOMBO_V3` — is simply absent from the
 * submitted graph, and the engine rejects the job with a missing-argument
 * TypeError once the render is already done.
 *
 * `adapter` covers a slot whose type no sink accepts directly: a mask is saved
 * by turning it into an image first, exactly as a user would wire it by hand.
 */
interface BoundarySink {
  classType: string;
  inputName: string;
  widgets: unknown[];
  adapter?: {
    classType: string;
    inputName: string;
    /** The type the adapter emits, i.e. what the sink receives. */
    outputType: string;
    widgets: unknown[];
  };
}

const SINK_FOR_SLOT_TYPE: Record<string, BoundarySink> = {
  IMAGE: { classType: "SaveImage", inputName: "images", widgets: ["node-banana"] },
  // filename_prefix, format, codec.
  VIDEO: { classType: "SaveVideo", inputName: "video", widgets: ["node-banana", "auto", "auto"] },
  AUDIO: { classType: "SaveAudio", inputName: "audio", widgets: ["node-banana"] },
  // `PreviewAny` renders in the ComfyUI web client and writes nothing, so a
  // text-producing blueprint ran and then reported that it had produced no
  // output. `SaveText` writes a file the run can actually collect.
  STRING: { classType: "SaveText", inputName: "text", widgets: ["node-banana", "txt"] },
  MESH: { classType: "SaveGLB", inputName: "mesh", widgets: ["node-banana"] },
  MASK: {
    classType: "SaveImage",
    inputName: "images",
    widgets: ["node-banana"],
    adapter: { classType: "MaskToImage", inputName: "mask", outputType: "IMAGE", widgets: [] },
  },
  // A gaussian splat is a scene, not a mesh, and no sink takes one directly.
  // `SaveGLB` does accept the 3D *file* a splat serialises to, so the file is
  // written as `.ply` — the one splat format a viewer is most likely to open.
  SPLAT: {
    classType: "SaveGLB",
    inputName: "mesh",
    widgets: ["node-banana"],
    adapter: {
      classType: "SplatToFile3D",
      inputName: "splat",
      outputType: "FILE_3D_SPLAT_ANY",
      widgets: ["ply"],
    },
  },
};

/**
 * Loader node class that supplies a value of a given boundary-input type.
 *
 * `adapter` mirrors {@link BoundarySink}: a node placed between the loader and
 * the boundary when the loader cannot emit the slot's type directly.
 */
interface BoundaryLoader {
  classType: string;
  widget: unknown[];
  adapter?: {
    classType: string;
    inputName: string;
    /** The type the adapter emits, i.e. what the boundary slot receives. */
    outputType: string;
    widgets: unknown[];
  };
}

const LOADER_FOR_SLOT_TYPE: Record<string, BoundaryLoader> = {
  IMAGE: { classType: "LoadImage", widget: [PLACEHOLDER_IMAGE, "image"] },
  // Not `LoadImageMask`, though it exists and would be the obvious choice.
  // Comfy Cloud stages an uploaded asset into the worker's input directory only
  // for the loader classes its asset layer knows — LoadImage, LoadVideo,
  // LoadAudio — so LoadImageMask never finds the file and rejects the prompt
  // with "Invalid image file" before a single step runs. Proven with two
  // minimal graphs differing only in the loader class. Loading the image and
  // converting it is what a user would do by hand, and it works on both engines.
  MASK: {
    classType: "LoadImage",
    widget: [PLACEHOLDER_IMAGE, "image"],
    adapter: {
      classType: "ImageToMask",
      inputName: "image",
      outputType: "MASK",
      widgets: ["red"],
    },
  },
  AUDIO: { classType: "LoadAudio", widget: [PLACEHOLDER_AUDIO, null, "audio"] },
  VIDEO: { classType: "LoadVideo", widget: [PLACEHOLDER_VIDEO, "video"] },
};

/**
 * The concrete type to materialise a boundary slot as.
 *
 * A slot that accepts more than one type is written as a comma-separated union:
 * an image-to-video blueprint declares its frame as `IMAGE,MASK`, meaning either
 * will do. Matching the union string as a whole finds nothing, which silently
 * cost those blueprints the very input they exist for — so each member is tried
 * in the author's declared order and the first one Node Banana can supply wins.
 */
function materializableType(
  raw: string | undefined,
  table: Record<string, unknown>
): string | null {
  for (const member of (raw ?? "").split(",")) {
    const type = member.trim().toUpperCase();
    if (type && type in table) return type;
  }
  return null;
}

/**
 * Lift one blueprint into a standalone editor workflow ready for conversion.
 *
 * The instance node is kept intact — the converter already knows how to expand
 * a subgraph instance and namespace its inner ids as `instance:inner` — and the
 * boundary is materialised into real nodes: a loader feeding each input slot,
 * a sink draining each output slot.
 *
 * Both halves are necessary. A blueprint's data enters and leaves through
 * *slots*, not through `LoadImage`/`SaveImage` nodes, so without this a
 * blueprint would inspect as having no inputs and would run persisting nothing.
 *
 * Boundary slots whose type has no loader or sink (LATENT, MODEL, …) are
 * skipped and reported — there is nothing a node could feed them or display.
 */
export function blueprintToWorkflowFile(
  file: EditorWorkflowFile,
  blueprintId: string
): {
  workflow: EditorWorkflowFile;
  instanceNodeId: string;
  skippedOutputs: string[];
  /** Boundary inputs with no loader — the graph cannot supply them. */
  unsupportedInputs: string[];
} {
  const def = (file.definitions?.subgraphs ?? []).find((d) => String(d.id) === blueprintId);
  if (!def) throw new ComfyConversionError(`Blueprint ${blueprintId} is not in this workflow`);

  const original = blueprintInstance(file, blueprintId);
  if (!original) {
    throw new ComfyConversionError(
      `Blueprint "${def.name ?? blueprintId}" has no instance node to run`
    );
  }

  // The instance's input links are rewritten below, so work on a copy — the
  // caller's file may be reused (e.g. to inspect a second blueprint).
  const instance: BlueprintInstanceNode = {
    ...original,
    inputs: (original.inputs ?? []).map((input) => ({ ...input })),
  };

  const nodes: EditorNode[] = [instance];
  const links: EditorLinkTuple[] = [];
  const skippedOutputs: string[] = [];
  const unsupportedInputs: string[] = [];

  // Ids for the materialised boundary nodes must not collide with anything
  // already present, including inner nodes that surface after expansion.
  let nextNodeId = 1_000_000;
  let nextLinkId = 900_000;

  (def.inputs ?? []).forEach((slot, index) => {
    const type = materializableType(slot.type, LOADER_FOR_SLOT_TYPE);
    const loader = type ? LOADER_FOR_SLOT_TYPE[type] : undefined;
    if (!loader || !type) {
      // A widget-backed slot is covered by proxyWidgets; a *link* slot (MODEL,
      // CONDITIONING, …) is not, and leaves the inner node missing a required
      // input the engine will reject. Report it rather than produce an app
      // that fails the moment it runs.
      const socket = (instance.inputs ?? []).find((i) => i.name === slot.name);
      if (socket && !socket.widget) {
        unsupportedInputs.push(`${slotLabel(slot, `input_${index}`)} (${slot.type ?? "unknown"})`);
      }
      return;
    }
    // Slots are matched to the instance's sockets by name: an instance
    // materialises only the boundary inputs the author actually wired, so
    // positions do not line up.
    const socket = (instance.inputs ?? []).find((i) => i.name === slot.name);
    if (!socket) return;

    const loaderId = nextNodeId++;
    const linkId = nextLinkId++;
    // The title becomes `_meta.title` on conversion, which is what inspection
    // reads for the handle's label — no separate mapping needed.
    const label = slotLabel(slot, `input_${index}`);

    // With an adapter the chain is loader → adapter → slot, so the loader's
    // output feeds the adapter and the adapter's feeds the boundary socket.
    if (loader.adapter) {
      const adapterId = nextNodeId++;
      const boundaryLinkId = nextLinkId++;
      socket.link = boundaryLinkId;
      links.push([linkId, loaderId, 0, adapterId, 0, loader.adapter.outputType]);
      links.push([boundaryLinkId, adapterId, 0, instance.id, index, type]);
      nodes.push({
        id: adapterId,
        type: loader.adapter.classType,
        inputs: [{ name: loader.adapter.inputName, type: "IMAGE", link: linkId }],
        outputs: [{ name: loader.adapter.outputType, type: loader.adapter.outputType }],
        widgets_values: loader.adapter.widgets,
      });
    } else {
      socket.link = linkId;
      links.push([linkId, loaderId, 0, instance.id, index, type]);
    }

    // Without an adapter the loader emits the slot's own type; with one it
    // emits whatever the adapter consumes, and the adapter converts.
    const loaderOutput = loader.adapter ? "IMAGE" : type;
    nodes.push({
      id: loaderId,
      type: loader.classType,
      title: label,
      inputs: [],
      outputs: [{ name: loaderOutput, type: loaderOutput }],
      widgets_values: loader.widget,
    });
  });

  (def.outputs ?? []).forEach((slot, index) => {
    const type = materializableType(slot.type, SINK_FOR_SLOT_TYPE);
    const sink = type ? SINK_FOR_SLOT_TYPE[type] : undefined;
    const label = slotLabel(slot, `output_${index}`);
    if (!sink || !type) {
      skippedOutputs.push(`${label} (${slot.type ?? "unknown"})`);
      return;
    }
    const sinkId = nextNodeId++;
    const linkId = nextLinkId++;

    // With an adapter the chain is slot → adapter → sink, so the boundary link
    // lands on the adapter and a second link carries its output to the sink.
    let sinkInputType = type;
    let sinkLinkId = linkId;
    if (sink.adapter) {
      const adapterId = nextNodeId++;
      links.push([linkId, instance.id, index, adapterId, 0, type]);
      sinkLinkId = nextLinkId++;
      links.push([sinkLinkId, adapterId, 0, sinkId, 0, sink.adapter.outputType]);
      sinkInputType = sink.adapter.outputType;
      nodes.push({
        id: adapterId,
        type: sink.adapter.classType,
        inputs: [{ name: sink.adapter.inputName, type, link: linkId }],
        outputs: [{ name: sink.adapter.outputType, type: sink.adapter.outputType }],
        widgets_values: sink.adapter.widgets,
      });
    } else {
      links.push([linkId, instance.id, index, sinkId, 0, type]);
    }

    nodes.push({
      id: sinkId,
      type: sink.classType,
      title: label,
      inputs: [{ name: sink.inputName, type: sinkInputType, link: sinkLinkId }],
      outputs: [],
      widgets_values: sink.widgets,
    });
  });

  return {
    workflow: {
      nodes,
      links,
      // Keep every definition so a blueprint that nests another still resolves.
      definitions: file.definitions,
      extra: {},
    },
    instanceNodeId: String(instance.id),
    skippedOutputs,
    unsupportedInputs,
  };
}

/**
 * `proxyWidgets` node id meaning "the subgraph's own boundary input slot",
 * rather than a node inside it.
 *
 * The author promoted a widget all the way onto the blueprint's edge instead of
 * proxying it from one inner node. Namespacing it like an ordinary id produced
 * `instance:-1`, a node no graph contains, and inspection dropped it in silence
 * — which is how a text-to-video app arrived with no prompt, no resolution and
 * no length. 22 of the 93 published Blueprints use this form, for 113 controls
 * between them.
 */
const BOUNDARY_SLOT_ID = "-1";

/** Where one inner link ends: the node it feeds and which of its inputs. */
function linkTargets(links: EditorLink[] | undefined): Map<number, { target: string; slot: number }> {
  const map = new Map<number, { target: string; slot: number }>();
  for (const link of links ?? []) {
    if (Array.isArray(link)) {
      map.set(link[0], { target: String(link[3]), slot: link[4] });
    } else if (link && typeof link === "object") {
      map.set(link.id, { target: String(link.target_id), slot: link.target_slot });
    }
  }
  return map;
}

/** One inner widget a boundary slot drives. */
interface BoundaryBinding {
  innerId: string;
  widget: string;
}

/**
 * The inner widgets a boundary input slot feeds, in the author's link order.
 *
 * A slot usually drives exactly one, but not always: an LTX blueprint routes a
 * single `ckpt_name` into three loaders, and exposing only the first would let
 * the user desynchronise the checkpoint from its VAE and text encoder.
 */
function boundarySlotBindings(def: SubgraphDef | undefined, slotName: string): BoundaryBinding[] {
  const slot = (def?.inputs ?? []).find((s) => s.name === slotName);
  if (!slot) return [];
  const targets = linkTargets(def?.links);
  const nodes = new Map((def?.nodes ?? []).map((n) => [String(n.id), n]));
  const bindings: BoundaryBinding[] = [];
  const seen = new Set<string>();

  for (const linkId of slot.linkIds ?? []) {
    const target = targets.get(linkId);
    if (!target) continue;
    // The slot addresses the input positionally; its name is what the graph
    // will be keyed by once the widget is inlined again.
    const widget = nodes.get(target.target)?.inputs?.[target.slot]?.name;
    if (!widget) continue;
    const key = `${target.target} ${widget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bindings.push({ innerId: target.target, widget });
  }
  return bindings;
}

/**
 * The App-Mode-equivalent surface of a blueprint.
 *
 * Blueprints carry no `linearData`, but `proxyWidgets` is the same idea: the
 * author naming exactly which inner widgets should be adjustable. Ids are
 * rewritten to the namespaced form the converter emits, so the result drops
 * straight into the normal inspection path.
 */
/**
 * The widgets a node's output feeds — the other direction from
 * {@link boundarySlotBindings}.
 *
 * Needed for `PrimitiveNode`, which holds a literal rather than producing one:
 * conversion resolves it away entirely, so a widget the author exposed *on* a
 * primitive has to be re-pointed at whatever the primitive was feeding, or the
 * control disappears. One published Blueprint loses its seed that way.
 */
function consumersOf(def: SubgraphDef | undefined, nodeId: string): BoundaryBinding[] {
  const nodes = new Map((def?.nodes ?? []).map((n) => [String(n.id), n]));
  const bindings: BoundaryBinding[] = [];
  const seen = new Set<string>();

  for (const link of def?.links ?? []) {
    const origin = Array.isArray(link) ? String(link[1]) : String(link.origin_id);
    if (origin !== nodeId) continue;
    const targetId = Array.isArray(link) ? String(link[3]) : String(link.target_id);
    const slot = Array.isArray(link) ? link[4] : link.target_slot;
    const widget = nodes.get(targetId)?.inputs?.[slot]?.name;
    if (!widget) continue;
    const key = `${targetId} ${widget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bindings.push({ innerId: targetId, widget });
  }
  return bindings;
}

/** Blueprints nest, so following a proxied widget can recurse. Bound to stop. */
const MAX_PROXY_DEPTH = 6;

/**
 * Where a proxied widget actually lands in the converted graph.
 *
 * `proxyWidgets` names a widget by (node, name), but three of those names point
 * at something that will not exist by the time the graph is built, and each one
 * silently cost a published Blueprint a control:
 *
 * - `-1` is the subgraph's own boundary slot, not a node.
 * - a `PrimitiveNode` is resolved away, its value inlined into what it feeds.
 * - a nested Blueprint instance is expanded, so the widget belongs to *its*
 *   boundary and ends up one namespace deeper.
 *
 * Returns fully-namespaced bindings, usually one, occasionally several — a
 * single slot can drive three loaders at once.
 */
function resolveProxied(
  file: EditorWorkflowFile,
  def: SubgraphDef | undefined,
  prefix: string,
  innerId: string,
  widget: string,
  depth = 0
): Array<{ nodeId: string; widget: string }> {
  if (!def || depth > MAX_PROXY_DEPTH) return [];

  if (innerId === BOUNDARY_SLOT_ID) {
    return boundarySlotBindings(def, widget).flatMap((b) =>
      resolveProxied(file, def, prefix, b.innerId, b.widget, depth + 1)
    );
  }

  const node = (def.nodes ?? []).find((n) => String(n.id) === innerId);
  if (!node) return [];

  if (node.type === "PrimitiveNode") {
    return consumersOf(def, innerId).flatMap((b) =>
      resolveProxied(file, def, prefix, b.innerId, b.widget, depth + 1)
    );
  }

  const nested = (file.definitions?.subgraphs ?? []).find(
    (d) => String(d.id) === String(node.type)
  );
  if (nested) {
    return boundarySlotBindings(nested, widget).flatMap((b) =>
      resolveProxied(file, nested, `${prefix}:${innerId}`, b.innerId, b.widget, depth + 1)
    );
  }

  return [{ nodeId: `${prefix}:${innerId}`, widget }];
}

export function blueprintAppMode(
  file: EditorWorkflowFile,
  blueprintId: string,
  instanceNodeId: string
): AppModeData | null {
  const instance = blueprintInstance(file, blueprintId);
  const proxied = instance?.properties?.proxyWidgets;
  if (!proxied?.length) return null;

  const def = (file.definitions?.subgraphs ?? []).find((d) => String(d.id) === blueprintId);
  const innerById = new Map((def?.nodes ?? []).map((n) => [String(n.id), n]));

  // Which boundary input slot, if any, each inner widget belongs to.
  //
  // An author can promote a widget two ways: onto the boundary (`-1`) or by
  // proxying the inner node directly. Both mean the same thing, and the second
  // form left us with no idea the widget was a declared *input* at all — so a
  // blueprint whose whole job is picking a line out of an incoming list offered
  // no way to feed it that list, only a text box to paste it into.
  const slotForWidget = new Map<string, { name?: string; label?: string; type?: string }>();
  for (const slot of def?.inputs ?? []) {
    if (!slot.name) continue;
    for (const binding of boundarySlotBindings(def, slot.name)) {
      slotForWidget.set(`${binding.innerId}|${binding.widget}`, slot);
    }
  }

  const inputs: AppModeData["inputs"] = [];
  for (const entry of proxied) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const widget = String(entry[1]);
    // `control_after_generate` is proxied alongside a seed but is a frontend
    // affordance, not an input the engine reads. `$$`-prefixed names are the
    // same kind of thing — canvas furniture such as `$$canvas-image-preview`,
    // which ComfyUI's own editor uses and the engine has never heard of.
    if (widget === "control_after_generate" || widget.startsWith("$$")) continue;
    const innerId = String(entry[0]);

    // A media slot is materialised as a real loader node instead, so binding it
    // here as a widget would either miss or duplicate that input.
    const slot =
      innerId === BOUNDARY_SLOT_ID
        ? (def?.inputs ?? []).find((s) => s.name === widget)
        : slotForWidget.get(`${innerId}|${widget}`);
    if (innerId === BOUNDARY_SLOT_ID && materializableType(slot?.type, LOADER_FOR_SLOT_TYPE)) {
      continue;
    }

    // Everything the slot drives, not merely the one input the author named.
    //
    // An author can promote a slot's control by naming any one of the inputs it
    // reaches, and the editor happily wires a slot to several at once. Where a
    // widget left unwritten simply keeps the author's own value, some of those
    // inputs are plain *sockets* — a maths node's `values.b`, a preview's
    // `source` — and there an unwritten input is a missing argument. Two
    // Blueprints had the prompt rejected outright for it; two more passed
    // validation and died mid-render on "'b' is not defined for expression
    // '(b - c) * (a - 1)'", after the model had run and been paid for.
    //
    // A materialisable slot is excluded because a real loader node supplies it.
    const named = [{ innerId, widget }];
    const targets =
      innerId !== BOUNDARY_SLOT_ID && slot?.name && !materializableType(slot.type, LOADER_FOR_SLOT_TYPE)
        ? [...named, ...boundarySlotBindings(def, slot.name)]
        : named;

    const seen = new Set<string>();
    const [primary, ...rest] = targets
      .flatMap((t) => resolveProxied(file, def, instanceNodeId, t.innerId, t.widget))
      .filter((b) => {
        const key = `${b.nodeId}|${b.widget}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (!primary) continue;
    if (inputs.some((i) => i.nodeId === primary.nodeId && i.widget === primary.widget)) continue;

    // A slot's own name is the author's, and unique across the boundary —
    // unlike the derived "CLIPLoader · Clip Name", which collides whenever a
    // blueprint loads two of anything. Failing that, the author's rename lives
    // on the inner node's own input entry; ComfyUI defaults that to the input's
    // own name, and such a label carries nothing, so only a genuine rename is
    // taken.
    const renamed = innerById.get(innerId)?.inputs?.find((i) => i.name === widget)?.label?.trim();
    const label = slot
      ? slotLabel(slot, widget)
      : renamed && renamed.toLowerCase() !== widget.toLowerCase()
        ? renamed
        : undefined;

    inputs.push({
      nodeId: primary.nodeId,
      widget: primary.widget,
      ...(label ? { label } : {}),
      ...(slot?.type === "STRING" ? { connectAs: "text" as const } : {}),
      ...(rest.length > 0 ? { alsoBind: rest } : {}),
    });
  }
  return inputs.length > 0 ? { inputs, outputNodeIds: [] } : null;
}
