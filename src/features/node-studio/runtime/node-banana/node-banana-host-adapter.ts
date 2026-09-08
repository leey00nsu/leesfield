import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import type {
  CanonicalEdge,
  CanonicalNode,
  GraphDocumentV3,
} from "@/shared/generation-graph/canonical-graph";
import {
  canonicalNodeKinds,
  findNodeDefinition,
  type CanonicalNodeKind,
} from "@/shared/generation-graph/node-registry";
import { getMediaAssetContentUrl } from "@/shared/media-assets/media-asset-content";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";

/**
 * The adapter deliberately owns no React Flow, Zustand, browser storage, or
 * provider code.  These small structural types are compatible with the
 * upstream WorkflowNode/WorkflowEdge shape while keeping the app-side bridge
 * usable in server and unit-test code too.
 */
export type NodeBananaHostRuntimeNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NodeBananaHostRuntimeEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NodeBananaHostRuntimeGraph = {
  nodes: readonly NodeBananaHostRuntimeNode[];
  edges: readonly NodeBananaHostRuntimeEdge[];
};

export type NodeBananaHostGraphInput = GraphDocumentV3 | NodeBananaHostRuntimeGraph;

export type NodeBananaResolvedAsset = {
  id?: string;
  url: string;
  type?: MediaType;
  mimeType?: string;
  bytes?: string | number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  filename?: string | null;
  metadata?: Record<string, unknown>;
};

export type NodeBananaAssetResolverContext = {
  nodeId: string;
  kind: string;
  portId?: string;
  sortOrder?: number;
  role: "input" | "output";
};

export type NodeBananaAssetResolverResult =
  | string
  | NodeBananaResolvedAsset
  | null
  | undefined;

export type NodeBananaAssetResolver = (
  assetId: string,
  context: NodeBananaAssetResolverContext,
) => NodeBananaAssetResolverResult;

/** The subset of the upstream SelectedModel/ProviderModel contract used by controls. */
export type NodeBananaModelCatalogEntry = {
  id?: string;
  modelId?: string;
  provider?: string;
  name?: string;
  displayName?: string;
  description?: string | null;
  capabilities?: readonly string[];
  pricing?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NodeBananaModelResolverContext = {
  nodeId: string;
  kind: string;
};

export type NodeBananaModelResolver = (
  modelKey: string,
  context: NodeBananaModelResolverContext,
) => NodeBananaModelCatalogEntry | null | undefined;

export type NodeBananaHostAdapterOptions = {
  /** Resolve both input asset IDs and selected output asset IDs. */
  resolveAsset?: NodeBananaAssetResolver;
  /** Alias useful to callers that already use an asset-resolver name. */
  assetResolver?: NodeBananaAssetResolver;
  /** Optional resolver used only for selected/output assets. */
  resolveOutputAsset?: NodeBananaAssetResolver;
  /** Resolve a canonical model key to the provider/catalog shape controls consume. */
  resolveModel?: NodeBananaModelResolver;
  /** Alias for integrations that call this a model catalog resolver. */
  modelResolver?: NodeBananaModelResolver;
  /** Static model catalog keyed by model key, or a list keyed by id/modelId. */
  modelCatalog?:
    | Readonly<Record<string, NodeBananaModelCatalogEntry>>
    | readonly NodeBananaModelCatalogEntry[];
};

export type NodeBananaAdaptedHandle = {
  id: string;
  direction: "input" | "output";
  canonicalPortId: string;
  valueType: string;
  dynamic: boolean;
  /** false for the canonical gallery audio extension absent from upstream DOM. */
  upstreamAvailable: boolean;
};

export type NodeBananaUpstreamNode = NodeBananaHostRuntimeNode & {
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type NodeBananaUpstreamEdge = NodeBananaHostRuntimeEdge & {
  sourceHandle: string;
  targetHandle: string;
  data: Record<string, unknown> & {
    sourcePortId: string;
    targetPortId: string;
    sortOrder: number;
    hasPause: boolean;
  };
};

/** Shape used by upstream store/utils/connectedInputs.ts. */
export type NodeBananaConnectedInputs = {
  images: string[];
  videos: string[];
  audio: string[];
  /** HostConnectedInputs in upstream-node-host.tsx calls this field audios. */
  audios: string[];
  model3d: string | null;
  text: string | null;
  textItems: string[];
  dynamicInputs: Record<string, string | string[]>;
  easeCurve: {
    bezierHandles: [number, number, number, number];
    easingPreset: string | null;
    outputDuration: number;
  } | null;
};

export type NodeBananaHostAdapterResult = {
  nodes: NodeBananaUpstreamNode[];
  edges: NodeBananaUpstreamEdge[];
  getConnectedInputs: (nodeId: string) => NodeBananaConnectedInputs;
};

export const nodeBananaLegacyTypeByCanonicalKind: Readonly<
  Record<CanonicalNodeKind, string>
> = {
  "input.image": "imageInput",
  "input.audio": "audioInput",
  "input.video": "videoInput",
  "input.prompt": "prompt",
  "process.promptConstructor": "promptConstructor",
  "generate.image": "nanoBanana",
  "generate.audio": "generateAudio",
  "generate.video": "generateVideo",
  "edit.image.annotation": "annotation",
  "edit.image.resize": "imageResize",
  "edit.image.removeBackground": "removeBackground",
  "edit.image.splitGrid": "splitGrid",
  "edit.image.gif": "gifEncoder",
  "edit.video.stitch": "videoStitch",
  "edit.video.trim": "videoTrim",
  "edit.video.frameGrab": "videoFrameGrab",
  "edit.video.easeCurve": "easeCurve",
  "output.single": "output",
  "output.gallery": "outputGallery",
  "inspect.imageCompare": "imageCompare",
};

const canonicalKindByLegacyType: Readonly<Record<string, CanonicalNodeKind>> =
  Object.fromEntries(
    Object.entries(nodeBananaLegacyTypeByCanonicalKind)
      .map(([kind, type]) => [type, kind]),
  ) as Record<string, CanonicalNodeKind>;

type JsonObject = Record<string, unknown>;

type NormalizedNode = {
  id: string;
  kind: string;
  position: { x: number; y: number };
  configVersion: number;
  config: JsonObject;
  selectedOutputAssetId: string | null;
  runtimeNode?: NodeBananaHostRuntimeNode;
  runtimeData: JsonObject;
};

type NormalizedEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  sortOrder: number;
  hasPause: boolean;
  originalIndex: number;
  runtimeEdge?: NodeBananaHostRuntimeEdge;
};

type ConnectedValue = {
  type: MediaType | "text";
  value: string;
  assetId?: string;
  sourceNodeId: string;
  sourceEdgeId?: string;
  sortOrder?: number;
  duration?: number | null;
  mimeType?: string;
};

type AdapterOptions = NodeBananaHostAdapterOptions & {
  resolveAsset?: NodeBananaAssetResolver;
};

const imageKinds = new Set<string>([
  "input.image",
  "generate.image",
  "edit.image.annotation",
  "edit.image.resize",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.frameGrab",
  "inspect.imageCompare",
]);

const videoKinds = new Set<string>([
  "input.video",
  "generate.video",
  "edit.video.stitch",
  "edit.video.trim",
  "edit.video.easeCurve",
]);

const audioKinds = new Set<string>(["input.audio", "generate.audio"]);

const imageOutputKinds = new Set<string>([
  "generate.image",
  "edit.image.annotation",
  "edit.image.resize",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.frameGrab",
]);

const videoOutputKinds = new Set<string>([
  "generate.video",
  "edit.video.stitch",
  "edit.video.trim",
  "edit.video.easeCurve",
]);

const audioOutputKinds = new Set<string>(["generate.audio"]);

const generationKinds = new Set<string>([
  "generate.image",
  "generate.audio",
  "generate.video",
]);

const operationKinds = new Set<string>([
  "edit.image.annotation",
  "edit.image.resize",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.stitch",
  "edit.video.trim",
  "edit.video.frameGrab",
  "edit.video.easeCurve",
]);

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function statusForUpstream(value: unknown): string {
  if (value === "pending" || value === "processing" || value === "uploading") return "loading";
  if (value === "failed") return "error";
  if (value === "completed" || value === "success" || value === "cancelled") return "idle";
  if (typeof value === "string" && value.length > 0) return value;
  return "idle";
}

function mediaTypeForKind(kind: string): MediaType | null {
  if (kind === "edit.image.gif") return "image";
  if (imageKinds.has(kind)) return "image";
  if (videoKinds.has(kind)) return "video";
  if (audioKinds.has(kind)) return "audio";
  return null;
}

function outputPortForKind(kind: string, configuredType?: MediaType | null): string | undefined {
  if ((kind === "output.single" || kind === "output.gallery") && configuredType) return configuredType;
  if (kind === "inspect.imageCompare") return "image";
  if (kind === "edit.image.splitGrid") return "images";
  if (kind === "edit.image.gif" || imageKinds.has(kind)) return "image";
  if (videoKinds.has(kind)) return "video";
  if (audioKinds.has(kind)) return "audio";
  return undefined;
}

function msToSeconds(value: unknown, fallback: unknown = 0): number {
  const milliseconds = numberValue(value);
  if (milliseconds !== null) return milliseconds / 1000;
  return numberValue(fallback) ?? 0;
}

function providerForKind(kind: string): string {
  return kind === "generate.image" ? "gemini" : "fal";
}

function modelEntryFor(
  modelKey: string | null,
  kind: string,
  nodeId: string,
  options: AdapterOptions,
): NodeBananaModelCatalogEntry | null {
  if (!modelKey) return null;
  const resolver = options.resolveModel ?? options.modelResolver;
  const resolved = resolver?.(modelKey, { nodeId, kind });
  if (resolved !== undefined) return resolved;
  const catalog = options.modelCatalog;
  if (Array.isArray(catalog)) {
    return catalog.find((entry) => entry.id === modelKey || entry.modelId === modelKey) ?? null;
  }
  return catalog
    ? (catalog as Readonly<Record<string, NodeBananaModelCatalogEntry>>)[modelKey] ?? null
    : null;
}

function selectedModelFor(
  kind: string,
  modelKey: string | null,
  current: unknown,
  catalogEntry: NodeBananaModelCatalogEntry | null,
) {
  // A missing model key is the hosted placeholder, not permission to retain
  // whatever selected model an older runtime projection carried.
  if (!modelKey) return undefined;
  const currentModel = isRecord(current) ? current : {};
  const currentMatchesKey = stringValue(currentModel.modelId) === modelKey;
  const modelId = modelKey;
  return {
    ...(catalogEntry ?? {}),
    ...currentModel,
    provider: stringValue(catalogEntry?.provider)
      ?? (currentMatchesKey ? stringValue(currentModel.provider) : null)
      ?? providerForKind(kind),
    // Canonical modelKey is authoritative even if runtime selectedModel is
    // one render behind a provider/model switch.
    modelId,
    displayName: stringValue(catalogEntry?.displayName)
      ?? stringValue(catalogEntry?.name)
      ?? (currentMatchesKey ? stringValue(currentModel.displayName) : null)
      ?? modelKey,
  };
}

function legacyDataToConfig(kind: string, data: JsonObject): JsonObject {
  const parameters: JsonObject = isRecord(data.parameters) ? { ...data.parameters } : {};
  const config: JsonObject = { parameters };

  if (kind === "input.image" || kind === "input.audio" || kind === "input.video") {
    config.assetId = data.assetId ?? data.imageRef ?? data.audioFileRef ?? data.videoRef ?? null;
  } else if (kind === "process.promptConstructor") {
    config.template = data.template ?? "";
  } else if (kind === "input.prompt") {
    config.text = data.prompt ?? "";
  } else if (generationKinds.has(kind)) {
    config.prompt = data.prompt ?? data.inputPrompt ?? "";
    config.modelKey = data.modelKey ?? data.model ?? objectValue(data.selectedModel).modelId ?? null;
  } else if (kind === "edit.image.annotation") {
    config.parameters = { shapes: arrayValue(data.annotations) };
  } else if (kind === "edit.image.resize") {
    config.parameters = {
      mode: data.mode,
      width: data.width,
      height: data.height,
      maxEdge: data.maxEdge,
      scalePct: data.scalePct,
      fit: data.fit,
      padColor: data.padColor,
      format: data.format,
      quality: data.quality,
    };
  } else if (kind === "edit.image.splitGrid") {
    config.parameters = {
      rows: data.gridRows,
      cols: data.gridCols,
      colOffsets: data.colOffsets,
      rowOffsets: data.rowOffsets,
    };
  } else if (kind === "edit.image.gif") {
    config.parameters = {
      fps: data.fps,
      loopCount: data.loopCount,
      colorCount: data.colorCount,
      dither: data.dither,
      targetMaxBytes: data.targetMaxBytes,
      clipOrder: data.clipOrder,
    };
  } else if (kind === "edit.video.stitch") {
    config.parameters = {
      repeat: data.loopCount,
      stripAudio: data.stripAudio,
      clipOrder: data.clipOrder,
    };
  } else if (kind === "edit.video.trim") {
    config.parameters = {
      startMs: numberValue(data.startMs) ?? (numberValue(data.startTime) ?? 0) * 1000,
      endMs: numberValue(data.endMs) ?? (numberValue(data.endTime) ?? 0) * 1000,
      stripAudio: data.stripAudio,
    };
  } else if (kind === "edit.video.frameGrab") {
    config.parameters = { position: data.framePosition };
  } else if (kind === "edit.video.easeCurve") {
    config.parameters = {
      outputDurationMs: numberValue(data.outputDurationMs) ?? (numberValue(data.outputDuration) ?? 0) * 1000,
      easingPreset: data.easingPreset,
      bezier: data.bezier ?? data.bezierHandles,
    };
  } else if (kind === "output.single" || kind === "output.gallery") {
    config.mediaType = data.contentType ?? null;
  }

  return config;
}

function normalizeGraph(input: NodeBananaHostGraphInput) {
  if (isCanonicalGraph(input)) {
    const nodes: NormalizedNode[] = input.nodes.map((node: CanonicalNode) => ({
      id: node.id,
      kind: node.kind,
      position: node.position,
      configVersion: node.configVersion,
      config: objectValue(node.config),
      selectedOutputAssetId: node.selectedOutputAssetId,
      runtimeData: {},
    }));
    const edges: NormalizedEdge[] = input.edges.map((edge: CanonicalEdge, originalIndex) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetNodeId: edge.targetNodeId,
      targetPortId: edge.targetPortId,
      sortOrder: edge.sortOrder,
      hasPause: edge.hasPause ?? false,
      originalIndex,
    }));
    return { canonical: true as const, nodes, edges };
  }

  const nodes: NormalizedNode[] = input.nodes.map((node) => {
    const runtimeData = objectValue(node.data);
    const kind = stringValue(runtimeData.canonicalKind)
      ?? canonicalKindByLegacyType[node.type ?? ""]
      ?? stringValue(runtimeData.kind)
      ?? node.type
      ?? "unsupported";
    const config = Object.hasOwn(runtimeData, "config")
      ? objectValue(runtimeData.config)
      : legacyDataToConfig(kind, runtimeData);
    return {
      id: node.id,
      kind,
      position: node.position ?? { x: 0, y: 0 },
      configVersion: numberValue(runtimeData.configVersion) ?? 1,
      config,
      selectedOutputAssetId: stringValue(runtimeData.selectedOutputAssetId),
      runtimeNode: node,
      runtimeData,
    };
  });

  const kindById = new Map(nodes.map((node) => [node.id, node.kind]));
  const imageInputsByTarget = new Map<string, number>();
  const edges: NormalizedEdge[] = input.edges.map((edge, originalIndex) => {
    const sourceKind = kindById.get(edge.source) ?? "";
    const targetKind = kindById.get(edge.target) ?? "";
    const data = objectValue(edge.data);
    const sourcePortId = stringValue(data.sourcePortId)
      ?? canonicalPortForUpstreamHandle(sourceKind, "output", edge.sourceHandle)
      ?? edge.sourceHandle
      ?? "";
    let targetPortId = stringValue(data.targetPortId)
      ?? canonicalPortForUpstreamHandle(targetKind, "input", edge.targetHandle)
      ?? edge.targetHandle
      ?? "";
    if (!stringValue(data.targetPortId) && targetKind === "generate.image" && edge.targetHandle === "image") {
      const priorImageInputs = imageInputsByTarget.get(edge.target) ?? 0;
      targetPortId = priorImageInputs === 0 ? "primary" : "references";
      imageInputsByTarget.set(edge.target, priorImageInputs + 1);
    }
    return {
      id: edge.id,
      sourceNodeId: edge.source,
      sourcePortId,
      targetNodeId: edge.target,
      targetPortId,
      sortOrder: numberValue(data.sortOrder) ?? 0,
      hasPause: data.hasPause === true,
      originalIndex,
      runtimeEdge: edge,
    };
  });

  return { canonical: false as const, nodes, edges };
}

function isCanonicalGraph(input: NodeBananaHostGraphInput): input is GraphDocumentV3 {
  return "schemaVersion" in input && input.schemaVersion === 3;
}

function upstreamHandleForCanonicalPort(
  kind: string,
  direction: "input" | "output",
  portId: string,
  sortOrder = 0,
): string {
  if (kind === "input.image" && direction === "input" && portId === "reference") return "reference";
  if (generationKinds.has(kind) && direction === "input" && portId === "prompt") return "text";
  if (kind === "generate.image") {
    if (direction === "input" && portId === "prompt") return "text";
    if (direction === "input" && (portId === "primary" || portId === "references")) return "image";
    if (direction === "output" && portId === "image") return "image";
  }
  if (kind === "generate.video" && direction === "input" && portId === "initImage") return "image";
  if (kind === "edit.image.splitGrid" && direction === "output" && portId === "images") return "reference";
  if (kind === "edit.image.gif" && direction === "input" && portId === "frames") return `image-${sortOrder}`;
  if (kind === "edit.video.stitch" && direction === "input" && portId === "clips") return `video-${sortOrder}`;
  if (kind === "edit.video.easeCurve" && portId === "settings") return "easeCurve";
  if (kind === "inspect.imageCompare" && direction === "input" && portId === "after") return "image-1";
  return portId;
}

/** Map an upstream handle back to its canonical port. Edge data remains authoritative when present. */
export function canonicalPortForUpstreamHandle(
  kind: string,
  direction: "input" | "output",
  handleId: string | null | undefined,
): string | null {
  if (!handleId) return null;
  if (kind === "generate.image") {
    if (direction === "input" && handleId === "text") return "prompt";
    if (direction === "input" && handleId === "reference") return "references";
    if (direction === "input" && handleId === "image") return "primary";
    if (direction === "output" && (handleId === "image" || handleId === "output")) return "image";
  }
  if (kind === "generate.video" && direction === "input" && handleId === "image") return "initImage";
  if (kind === "generate.video" && direction === "input" && handleId === "text") return "prompt";
  if (kind === "generate.audio" && direction === "input" && handleId === "text") return "prompt";
  if (kind === "edit.image.splitGrid" && direction === "output" && handleId === "reference") return "images";
  if (kind === "edit.image.gif" && direction === "input" && /^image-\d+$/.test(handleId)) return "frames";
  if (kind === "edit.video.stitch" && direction === "input" && /^video-\d+$/.test(handleId)) return "clips";
  if (kind === "edit.video.easeCurve" && handleId === "easeCurve") return "settings";
  if (kind === "inspect.imageCompare" && direction === "input" && handleId === "image-1") return "after";
  return handleId;
}

/**
 * Return the actual upstream-visible handles for a canonical kind. Ordered
 * ports use the first dynamic handle as a shape marker; each adapted edge gets
 * its concrete `-N` handle. The hosted OutputGalleryNode extension renders the
 * canonical image, video, and audio handles, so all three are available.
 */
export function upstreamHandlesForCanonicalKind(kind: string): NodeBananaAdaptedHandle[] {
  const definition = findNodeDefinition(kind);
  if (!definition) return [];
  const handles: NodeBananaAdaptedHandle[] = [];
  const seen = new Set<string>();
  for (const port of definition.ports) {
    const dynamic = port.ordered && port.edgeCardinality === "many";
    const id = upstreamHandleForCanonicalPort(kind, port.direction, port.id, dynamic ? 0 : 0);
    if (seen.has(`${port.direction}:${id}`)) continue;
    seen.add(`${port.direction}:${id}`);
    handles.push({
      id,
      direction: port.direction,
      canonicalPortId: port.id,
      valueType: port.valueType,
      dynamic,
      upstreamAvailable: true,
    });
  }
  return handles;
}

function resolveAsset(
  assetId: string,
  context: NodeBananaAssetResolverContext,
  options: AdapterOptions,
  inferredType: MediaType | null,
): NodeBananaResolvedAsset | null {
  const resolver = context.role === "output"
    ? options.resolveOutputAsset ?? options.resolveAsset ?? options.assetResolver
    : options.resolveAsset ?? options.assetResolver;
  const result = resolver?.(assetId, context);
  if (result === null) return null;
  if (typeof result === "string") {
    return { id: assetId, url: result, type: inferredType ?? undefined };
  }
  if (isRecord(result) && typeof result.url === "string") {
    return { ...result, id: stringValue(result.id) ?? assetId, type: result.type as MediaType | undefined };
  }
  // Asset IDs are valid media references even without a catalog query. The
  // canonical media contract defines this stable content route as fallback.
  return {
    id: assetId,
    url: getMediaAssetContentUrl(assetId),
    type: inferredType ?? undefined,
  };
}

function dimensionsFor(asset: NodeBananaResolvedAsset | null) {
  if (!asset || asset.width === undefined || asset.height === undefined) return null;
  if (asset.width === null || asset.height === null) return null;
  return { width: asset.width, height: asset.height };
}

function durationSecondsFor(asset: NodeBananaResolvedAsset | null): number | null {
  if (!asset || asset.durationMs === undefined || asset.durationMs === null) return null;
  return asset.durationMs / 1000;
}

function assetFromData(data: JsonObject, type: MediaType): ConnectedValue | null {
  const fields = type === "image"
    ? ["outputImage", "image", "outputGif"]
    : type === "video"
      ? ["outputVideo", "video"]
      : ["outputAudio", "audioFile", "audio"];
  for (const field of fields) {
    const value = stringValue(data[field]);
    if (!value) continue;
    const refField = type === "image"
      ? field === "image" ? "imageRef" : "outputImageRef"
      : type === "video"
        ? field === "video" ? "videoRef" : "outputVideoRef"
        : field === "audioFile" ? "audioFileRef" : "outputAudioRef";
    const metadata = objectValue(data.outputAsset);
    return {
      type,
      value,
      assetId: stringValue(data[refField]) ?? stringValue(metadata.id) ?? undefined,
      sourceNodeId: "",
      duration: numberValue(data.duration),
      mimeType: stringValue(data.format) ?? stringValue(metadata.mimeType) ?? undefined,
    };
  }
  return null;
}

// Split references show which grid produced a cell; the cell owns its slice asset.
function isSplitCellReference(edge: NodeBananaUpstreamEdge, nodesById: Map<string, NodeBananaUpstreamNode>) {
  return (edge.data.targetPortId === "reference" || edge.targetHandle === "reference")
    && nodesById.get(edge.target)?.data.canonicalKind === "input.image"
    && nodesById.get(edge.source)?.data.canonicalKind === "edit.image.splitGrid";
}

function sourceValuesFor(
  node: NodeBananaUpstreamNode,
  sourcePortId: string,
  nodesById: Map<string, NodeBananaUpstreamNode>,
  edges: NodeBananaUpstreamEdge[],
  visited: Set<string>,
): ConnectedValue[] {
  if (visited.has(node.id)) return [];
  const nextVisited = new Set(visited).add(node.id);
  const data = node.data;
  const kind = stringValue(data.canonicalKind) ?? "";
  if ((kind === "input.prompt" || kind === "process.promptConstructor") && sourcePortId === "text") {
    try {
      const text = resolveGraphText({ nodes: [...nodesById.values()].map((source) => ({ id: source.id, kind: String(source.data.canonicalKind), config: source.data.config })),
        edges: edges.map((edge) => ({ sourceNodeId: edge.source, targetNodeId: edge.target, targetPortId: edge.data.targetPortId, sortOrder: edge.data.sortOrder, hasPause: edge.data.hasPause })) }, node.id);
      return text ? [{ type: "text", value: text, sourceNodeId: node.id }] : [];
    } catch { return []; }
  }
  const values: ConnectedValue[] = [];
  const add = (value: ConnectedValue | null) => {
    if (value?.value) values.push({ ...value, sourceNodeId: node.id });
  };

  const passThroughTargetPort = kind === "input.image" && sourcePortId === "image"
    ? "reference"
    : kind === "input.audio" && sourcePortId === "audio"
      ? "audio"
      : kind === "input.video" && sourcePortId === "video"
        ? "video"
        : kind === "input.prompt" && sourcePortId === "text"
          ? "text"
          : null;
  if (passThroughTargetPort) {
    const incomingEdges = edges
      .filter((edge) => edge.target === node.id
        && !edge.data.isLoop
        && !isSplitCellReference(edge, nodesById)
        && edge.data.targetPortId === passThroughTargetPort)
      .sort(edgeOrder);
    if (incomingEdges.length > 0) {
      return incomingEdges.flatMap((edge) => {
        const source = nodesById.get(edge.source);
        if (!source) return [];
        const sourcePort = stringValue(edge.data.sourcePortId)
          ?? canonicalPortForUpstreamHandle(stringValue(source.data.canonicalKind) ?? source.type, "output", edge.sourceHandle)
          ?? edge.sourceHandle;
        return sourceValuesFor(source, sourcePort, nodesById, edges, nextVisited);
      });
    }
  }

  if (kind === "input.image" && sourcePortId === "image") add(assetFromData(data, "image"));
  else if (kind === "input.audio" && sourcePortId === "audio") add(assetFromData(data, "audio"));
  else if (kind === "input.video" && sourcePortId === "video") add(assetFromData(data, "video"));
  else if (kind === "input.prompt" && sourcePortId === "text") {
    const prompt = stringValue(data.prompt);
    if (prompt) values.push({ type: "text", value: prompt, sourceNodeId: node.id });
  } else if (kind === "generate.image" && sourcePortId === "image") add(assetFromData(data, "image"));
  else if (kind === "generate.audio" && sourcePortId === "audio") add(assetFromData(data, "audio"));
  else if (kind === "generate.video" && sourcePortId === "video") add(assetFromData(data, "video"));
  else if (kind === "edit.image.annotation" || kind === "edit.image.resize" || kind === "edit.image.removeBackground" || kind === "edit.video.frameGrab") {
    if (sourcePortId === "image") add(assetFromData(data, "image"));
  } else if (kind === "edit.image.splitGrid" && (sourcePortId === "images" || sourcePortId === "reference")) {
    const outputImages = arrayValue(data.outputImages);
    if (outputImages.length > 0) {
      outputImages.forEach((value, index) => {
        if (typeof value === "string") values.push({ type: "image", value, sourceNodeId: node.id, assetId: arrayValue(data.outputImageRefs)[index] as string | undefined });
      });
    } else add(assetFromData(data, "image"));
  } else if (kind === "edit.image.gif" && sourcePortId === "image") add(assetFromData(data, "image"));
  else if ((kind === "edit.video.stitch" || kind === "edit.video.trim" || kind === "edit.video.easeCurve") && sourcePortId === "video") add(assetFromData(data, "video"));
  else if (kind === "output.single") {
    const type = sourcePortId === "video" ? "video" : sourcePortId === "audio" ? "audio" : "image";
    add(assetFromData(data, type));
  } else if (kind === "output.gallery") {
    const type = sourcePortId === "video" ? "video" : sourcePortId === "audio" ? "audio" : "image";
    const field = type === "image" ? "images" : type === "video" ? "videos" : "audios";
    const refs = type === "image" ? "imageRefs" : type === "video" ? "videoRefs" : "audioRefs";
    const list = arrayValue(data[field]);
    if (list.length > 0) {
      list.forEach((value, index) => {
        if (typeof value === "string") values.push({ type, value, sourceNodeId: node.id, assetId: arrayValue(data[refs])[index] as string | undefined });
      });
    }
  }

  return values;
}

function edgeOrder(a: { data: { sortOrder?: unknown }; _adapterIndex?: unknown }, b: { data: { sortOrder?: unknown }; _adapterIndex?: unknown }) {
  const aOrder = numberValue(a.data.sortOrder) ?? 0;
  const bOrder = numberValue(b.data.sortOrder) ?? 0;
  return aOrder - bOrder || (numberValue(a._adapterIndex) ?? 0) - (numberValue(b._adapterIndex) ?? 0);
}

function addDynamicInput(
  dynamicInputs: Record<string, string | string[]>,
  name: string,
  value: string,
) {
  const existing = dynamicInputs[name];
  dynamicInputs[name] = existing === undefined
    ? value
    : Array.isArray(existing)
      ? [...existing, value]
      : [existing, value];
}

function schemaNameForHandle(data: JsonObject, handle: string): string | null {
  const schema = arrayValue(data.inputSchema).filter(isRecord);
  if (schema.length === 0) return null;
  const match = /^(image|video|audio|text)(?:-(\d+))?$/.exec(handle);
  if (!match) return null;
  const type = match[1];
  const index = Number(match[2] ?? 0);
  const candidates = schema.filter((entry) => entry.type === type);
  return stringValue(candidates[index]?.name) ?? null;
}

function makeConnectedInputs(
  nodeId: string,
  nodes: NodeBananaUpstreamNode[],
  edges: NodeBananaUpstreamEdge[],
): NodeBananaConnectedInputs {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const nodesById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const images: string[] = [];
  const videos: string[] = [];
  const audio: string[] = [];
  const textItems: string[] = [];
  const dynamicInputs: Record<string, string | string[]> = {};
  let text: string | null = null;
  let easeCurve: NodeBananaConnectedInputs["easeCurve"] = null;
  const incoming = edges
    .filter((edge) => edge.target === nodeId && !edge.data.isLoop && !isSplitCellReference(edge, nodesById))
    .sort(edgeOrder);

  for (const edge of incoming) {
    const targetHandle = edge.targetHandle;
    if (targetHandle === "easeCurve") {
      const source = nodesById.get(edge.source);
      if (source?.type === "easeCurve" || source?.data.canonicalKind === "edit.video.easeCurve") {
        const sourceData = source.data;
        const handles = arrayValue(sourceData.bezierHandles ?? sourceData.bezier);
        if (handles.length === 4 && handles.every((value) => typeof value === "number")) {
          easeCurve = {
            bezierHandles: handles as [number, number, number, number],
            easingPreset: stringValue(sourceData.easingPreset),
            outputDuration: numberValue(sourceData.outputDuration) ?? 0,
          };
        }
      }
      continue;
    }
    const source = nodesById.get(edge.source);
    if (!source) continue;
    const sourcePortId = stringValue(edge.data.sourcePortId)
      ?? canonicalPortForUpstreamHandle(stringValue(source.data.canonicalKind) ?? source.type, "output", edge.sourceHandle)
      ?? edge.sourceHandle;
    const values = sourceValuesFor(source, sourcePortId, nodesById, edges, new Set<string>())
      .map((value) => ({
        ...value,
        sourceEdgeId: edge.id,
        sortOrder: numberValue(edge.data.sortOrder) ?? 0,
      }));
    const schemaName = node ? schemaNameForHandle(node.data, targetHandle) : null;
    for (const value of values) {
      if (schemaName) addDynamicInput(dynamicInputs, schemaName, value.value);
      if (value.type === "image") images.push(value.value);
      else if (value.type === "video") videos.push(value.value);
      else if (value.type === "audio") audio.push(value.value);
      else {
        text = value.value;
      }
    }
  }

  return {
    images,
    videos,
    audio,
    audios: audio,
    model3d: null,
    text,
    textItems,
    dynamicInputs,
    easeCurve,
  };
}

function valuesForNode(
  nodeId: string,
  edges: NodeBananaUpstreamEdge[],
  nodesById: Map<string, NodeBananaUpstreamNode>,
): ConnectedValue[] {
  return edges
    .filter((edge) => edge.target === nodeId && !edge.data.isLoop && edge.targetHandle !== "easeCurve" && !isSplitCellReference(edge, nodesById))
    .sort(edgeOrder)
    .flatMap((edge) => {
      const source = nodesById.get(edge.source);
      if (!source) return [];
      const sourcePortId = stringValue(edge.data.sourcePortId)
        ?? canonicalPortForUpstreamHandle(stringValue(source.data.canonicalKind) ?? source.type, "output", edge.sourceHandle)
        ?? edge.sourceHandle;
      return sourceValuesFor(source, sourcePortId, nodesById, edges, new Set<string>())
        .map((value) => ({
          ...value,
          sourceEdgeId: edge.id,
          sortOrder: numberValue(edge.data.sortOrder) ?? 0,
        }));
    });
}

function refList(values: ConnectedValue[], type: MediaType) {
  return values.filter((value) => value.type === type).map((value) => value.assetId).filter((value): value is string => Boolean(value));
}

function projectConnectedFields(
  node: NodeBananaUpstreamNode,
  getInputs: (nodeId: string) => NodeBananaConnectedInputs,
  values: ConnectedValue[],
) {
  const kind = stringValue(node.data.canonicalKind) ?? "";
  const data = node.data;
  const inputs = getInputs(node.id);
  const images = values.filter((value) => value.type === "image");
  const videos = values.filter((value) => value.type === "video");
  const audios = values.filter((value) => value.type === "audio");
  const firstImage = images[0];
  const firstVideo = videos[0];
  const firstAudio = audios[0];

  if (kind === "edit.image.annotation") {
    data.sourceImage = firstImage?.value ?? null;
    data.sourceImageRef = firstImage?.assetId ?? null;
  } else if (kind === "edit.image.resize" || kind === "edit.image.removeBackground" || kind === "edit.image.splitGrid") {
    data.sourceImage = firstImage?.value ?? null;
    data.sourceImageRef = firstImage?.assetId ?? null;
  } else if (kind === "edit.image.gif") {
    data.frames = images.map((value) => value.value);
    data.frameRefs = refList(images, "image");
  } else if (kind === "edit.video.stitch") {
    data.clips = videos.map((value) => ({
      edgeId: value.sourceEdgeId ?? "",
      sourceNodeId: value.sourceNodeId,
      thumbnail: value.value,
      duration: value.duration ?? null,
      handleId: value.sortOrder === undefined ? "video" : `video-${value.sortOrder}`,
    }));
    data.clipUrls = videos.map((value) => value.value);
    data.clipRefs = refList(videos, "video");
    data.soundtrack = firstAudio?.value ?? null;
    data.soundtrackRef = firstAudio?.assetId ?? null;
  } else if (kind === "edit.video.trim") {
    data.sourceVideo = firstVideo?.value ?? null;
    data.sourceVideoRef = firstVideo?.assetId ?? null;
    data.duration = firstVideo?.duration ?? null;
  } else if (kind === "edit.video.frameGrab" || kind === "edit.video.easeCurve") {
    data.sourceVideo = firstVideo?.value ?? null;
    data.sourceVideoRef = firstVideo?.assetId ?? null;
  } else if (kind === "output.single") {
    const mediaType = stringValue(objectValue(data.config).mediaType) as MediaType | null;
    const selected = mediaType === "video" ? firstVideo : mediaType === "audio" ? firstAudio : mediaType === "image" ? firstImage : firstAudio ?? firstVideo ?? firstImage;
    data.image = null;
    data.video = null;
    data.audio = null;
    data.imageRef = null;
    data.videoRef = null;
    data.audioRef = null;
    if (selected) {
      data.contentType = selected.type;
      data[selected.type] = selected.value;
      if (selected.type === "image") data.imageRef = selected.assetId;
      if (selected.type === "video") data.videoRef = selected.assetId;
      if (selected.type === "audio") data.audioRef = selected.assetId;
    }
  } else if (kind === "output.gallery") {
    data.images = images.map((value) => value.value);
    data.imageRefs = refList(images, "image");
    data.videos = videos.map((value) => value.value);
    data.videoRefs = refList(videos, "video");
    // OutputGalleryNode v1.9.0 cannot render audio. Keep the extension data so
    // the host can expose it without lying about an upstream audio handle.
    data.audios = audios.map((value) => value.value);
    data.audioRefs = refList(audios, "audio");
  } else if (kind === "inspect.imageCompare") {
    const before = values.filter((value) => value.type === "image")[0];
    const after = values.filter((value) => value.type === "image")[1];
    data.imageA = before?.value ?? null;
    data.imageB = after?.value ?? null;
    data.imageARef = before?.assetId ?? null;
    data.imageBRef = after?.assetId ?? null;
  }

  // Keep the exact upstream `getConnectedInputs` values visible on data for
  // host providers that render a node outside the React Flow store.
  data.connectedInputs = inputs;
}

function projectNodeData(
  normalized: NormalizedNode,
  incoming: Map<string, NormalizedEdge[]>,
  options: AdapterOptions,
): Record<string, unknown> {
  const kind = normalized.kind;
  const config = normalized.config;
  const parameters = objectValue(config.parameters);
  const presentation = objectValue(config.presentation);
  const data: Record<string, unknown> = {
    ...normalized.runtimeData,
    canonicalKind: kind,
    canonicalConfig: config,
    config,
    configVersion: normalized.configVersion,
    selectedOutputAssetId: normalized.selectedOutputAssetId,
    upstreamType: nodeBananaLegacyTypeByCanonicalKind[kind as CanonicalNodeKind] ?? normalized.runtimeNode?.type ?? kind,
    upstreamHandles: upstreamHandlesForCanonicalKind(kind),
    customTitle: presentation.customTitle,
    comment: presentation.comment,
    isOptional: presentation.isOptional,
  };
  Object.assign(data, parameters);

  const rawStatus = data.executionStatus ?? data.status;
  data.status = statusForUpstream(rawStatus);
  data.isRunning = data.status === "loading";
  data.progress = numberValue(data.executionProgress) ?? numberValue(data.progress) ?? 0;
  data.error = data.error ?? null;
  data.runReady = data.supported !== false && (generationKinds.has(kind) || operationKinds.has(kind));

  const inbound = incoming.get(normalized.id) ?? [];
  const orderedEdgeIds = [...inbound]
    .filter((edge) =>
      (kind === "edit.image.gif" && edge.targetPortId === "frames")
      || (kind === "edit.video.stitch" && edge.targetPortId === "clips")
      || (kind !== "edit.image.gif" && kind !== "edit.video.stitch"),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.originalIndex - b.originalIndex)
    .map((edge) => edge.id);

  if (kind === "input.image") {
    const assetId = stringValue(config.assetId);
    const asset = assetId
      ? resolveAsset(assetId, { nodeId: normalized.id, kind, portId: "image", role: "input" }, options, "image")
      : null;
    data.image = asset?.url ?? null;
    data.imageRef = asset?.id ?? assetId ?? null;
    data.filename = asset?.filename ?? null;
    data.dimensions = dimensionsFor(asset) ?? null;
  } else if (kind === "input.audio") {
    const assetId = stringValue(config.assetId);
    const asset = assetId
      ? resolveAsset(assetId, { nodeId: normalized.id, kind, portId: "audio", role: "input" }, options, "audio")
      : null;
    data.audioFile = asset?.url ?? null;
    data.audioFileRef = asset?.id ?? assetId ?? null;
    data.filename = asset?.filename ?? null;
    data.duration = durationSecondsFor(asset) ?? null;
    data.format = asset?.mimeType ?? null;
  } else if (kind === "input.video") {
    const assetId = stringValue(config.assetId);
    const asset = assetId
      ? resolveAsset(assetId, { nodeId: normalized.id, kind, portId: "video", role: "input" }, options, "video")
      : null;
    data.video = asset?.url ?? null;
    data.videoRef = asset?.id ?? assetId ?? null;
    // Vendored Trim/Frame Grab/Ease presenters inspect source nodes through
    // outputVideo. Preserve the canonical video fields while exposing the
    // equivalent upstream alias and its durable asset reference.
    data.outputVideo = asset?.url ?? null;
    data.outputVideoRef = asset?.id ?? assetId ?? null;
    data.filename = asset?.filename ?? null;
    data.duration = durationSecondsFor(asset) ?? null;
    data.dimensions = dimensionsFor(asset) ?? null;
    data.format = asset?.mimeType ?? null;
  } else if (kind === "process.promptConstructor") {
    data.template = typeof config.template === "string" ? config.template : "";
  } else if (kind === "input.prompt") {
    data.variableName = config.variableName;
    data.prompt = typeof config.text === "string" ? config.text : stringValue(data.prompt) ?? "";
  } else if (generationKinds.has(kind)) {
    const modelKey = Object.hasOwn(config, "modelKey")
      ? stringValue(config.modelKey)
      : stringValue(data.modelKey) ?? stringValue(data.model) ?? stringValue(objectValue(data.selectedModel).modelId);
    const catalogEntry = modelEntryFor(modelKey, kind, normalized.id, options);
    data.prompt = typeof config.prompt === "string" ? config.prompt : stringValue(data.prompt) ?? "";
    data.inputPrompt = data.prompt;
    data.modelKey = modelKey;
    data.model = modelKey;
    data.selectedModel = selectedModelFor(kind, modelKey, data.selectedModel, catalogEntry);
    if (catalogEntry) data.modelCatalogEntry = catalogEntry;
    data.parameters = parameters;
    // `parameters.inputSchema` is the canonical dynamic schema. Never retain
    // an old runtime schema when the selected model/provider was cleared or
    // replaced; metadata/hardcoded Veo schemas are the only valid fallbacks.
    if (Array.isArray(parameters.inputSchema)) {
      data.inputSchema = parameters.inputSchema;
    } else {
      const catalogMeta = objectValue(catalogEntry?.meta);
      const catalogSchema = Array.isArray(catalogMeta.inputSchema)
        ? catalogMeta.inputSchema
        : Array.isArray(catalogMeta.input_schema)
          ? catalogMeta.input_schema
          : kind === "generate.video" && modelKey?.startsWith("veo-")
            ? [
                ...(modelKey.includes("image-to-video")
                  ? [{ name: "image", type: "image", required: true, label: "Image" }]
                  : []),
                { name: "prompt", type: "text", required: true, label: "Prompt" },
                { name: "negative_prompt", type: "text", required: false, label: "Neg. Prompt" },
              ]
            : undefined;
      data.inputSchema = catalogSchema;
    }
  } else if (kind === "edit.image.annotation") {
    data.annotations = arrayValue(parameters.shapes);
    data.sourceImage = data.sourceImage ?? null;
    data.outputImage = data.outputImage ?? null;
  } else if (kind === "edit.image.resize") {
    data.sourceImage = data.sourceImage ?? null;
    data.outputImage = data.outputImage ?? null;
  } else if (kind === "edit.image.removeBackground") {
    data.model = data.model ?? parameters.model ?? "isnet_fp16";
    data.outputImage = data.outputImage ?? null;
  } else if (kind === "edit.image.splitGrid") {
    data.gridRows = parameters.rows ?? data.gridRows ?? 2;
    data.gridCols = parameters.cols ?? data.gridCols ?? 2;
    data.colOffsets = parameters.colOffsets ?? data.colOffsets ?? [];
    data.rowOffsets = parameters.rowOffsets ?? data.rowOffsets ?? [];
    // The hosted graph deliberately does not materialize SplitGrid's
    // downstream cell/router template. Keep the upstream grid editor intact,
    // but don't expose a button whose action cannot be persisted by this host.
    data.disableSplitGridTemplateEditor = false;
    data.sourceImage = data.sourceImage ?? null;
  } else if (kind === "edit.image.gif") {
    data.clipOrder = Array.isArray(parameters.clipOrder) ? parameters.clipOrder : orderedEdgeIds;
    data.outputGif = data.outputGif ?? null;
  } else if (kind === "edit.video.stitch") {
    data.clipOrder = Array.isArray(parameters.clipOrder) ? parameters.clipOrder : orderedEdgeIds;
    data.loopCount = parameters.repeat ?? data.loopCount ?? 1;
    data.stripAudio = parameters.stripAudio ?? data.stripAudio ?? false;
    data.outputVideo = data.outputVideo ?? null;
  } else if (kind === "edit.video.trim") {
    data.startMs = parameters.startMs ?? data.startMs ?? 0;
    data.endMs = parameters.endMs ?? data.endMs ?? 0;
    data.startTime = msToSeconds(parameters.startMs, data.startTime);
    data.endTime = msToSeconds(parameters.endMs, data.endTime);
    data.stripAudio = parameters.stripAudio ?? data.stripAudio ?? false;
    data.outputVideo = data.outputVideo ?? null;
  } else if (kind === "edit.video.frameGrab") {
    data.framePosition = parameters.position ?? data.framePosition ?? "first";
    data.outputImage = data.outputImage ?? null;
  } else if (kind === "edit.video.easeCurve") {
    const bezier = arrayValue(parameters.bezier ?? data.bezierHandles);
    if (bezier.length === 4) {
      data.bezierHandles = bezier;
      data.bezier = bezier;
    }
    data.easingPreset = parameters.easingPreset ?? data.easingPreset ?? null;
    data.outputDurationMs = parameters.outputDurationMs ?? data.outputDurationMs ?? 1500;
    data.outputDuration = msToSeconds(parameters.outputDurationMs, data.outputDuration);
    data.outputVideo = data.outputVideo ?? null;
  } else if (kind === "output.single") {
    data.contentType = config.mediaType ?? data.contentType;
    data.image = data.image ?? null;
    data.video = data.video ?? null;
    data.audio = data.audio ?? null;
  } else if (kind === "output.gallery") {
    data.images = Array.isArray(data.images) ? data.images : [];
    data.videos = Array.isArray(data.videos) ? data.videos : [];
    data.audios = Array.isArray(data.audios) ? data.audios : [];
  } else if (kind === "inspect.imageCompare") {
    data.imageA = data.imageA ?? null;
    data.imageB = data.imageB ?? null;
  }

  const selectedId = normalized.selectedOutputAssetId;
  if (!selectedId) {
    data.outputAssetId = null;
    data.outputAsset = null;
    if (kind === "edit.image.gif") data.outputGif = null;
    else if (imageOutputKinds.has(kind)) data.outputImage = null;
    else if (videoOutputKinds.has(kind)) data.outputVideo = null;
    else if (audioOutputKinds.has(kind)) data.outputAudio = null;
  }
  if (selectedId) {
    const configuredOutputType = stringValue(config.mediaType) as MediaType | null;
    const outputType = configuredOutputType ?? mediaTypeForKind(kind);
    const asset = resolveAsset(selectedId, {
      nodeId: normalized.id,
      kind,
      portId: outputPortForKind(kind, outputType),
      role: "output",
    }, options, outputType);
    if (asset) {
      data.outputAssetId = asset.id ?? selectedId;
      data.outputAsset = asset;
      if (kind === "edit.image.gif") data.outputGif = asset.url;
      else if (imageOutputKinds.has(kind)) data.outputImage = asset.url;
      else if (videoOutputKinds.has(kind)) data.outputVideo = asset.url;
      else if (audioOutputKinds.has(kind)) data.outputAudio = asset.url;
      if (kind === "output.single" || kind === "output.gallery" || kind === "inspect.imageCompare") {
        const outputMediaType = asset.type ?? outputType;
        if (outputMediaType === "image") data.image = asset.url;
        if (outputMediaType === "video") data.video = asset.url;
        if (outputMediaType === "audio") data.audio = asset.url;
      }
    }
  }

  return data;
}

function adaptOptions(
  optionsOrResolver: NodeBananaHostAdapterOptions | NodeBananaAssetResolver | undefined,
): AdapterOptions {
  return typeof optionsOrResolver === "function"
    ? { resolveAsset: optionsOrResolver }
    : optionsOrResolver ?? {};
}

/**
 * Project a canonical or already-materialized runtime graph into the exact
 * legacy node type/data and edge handle contract consumed by Node Banana v1.9.0.
 */
export function adaptNodeBananaHostGraph(
  input: NodeBananaHostGraphInput,
  optionsOrResolver?: NodeBananaHostAdapterOptions | NodeBananaAssetResolver,
): NodeBananaHostAdapterResult {
  const options = adaptOptions(optionsOrResolver);
  const normalized = normalizeGraph(input);
  const incoming = new Map<string, NormalizedEdge[]>();
  for (const edge of normalized.edges) {
    const current = incoming.get(edge.targetNodeId) ?? [];
    current.push(edge);
    incoming.set(edge.targetNodeId, current);
  }

  let nodes: NodeBananaUpstreamNode[] = normalized.nodes.map((node) => {
    const legacyType = nodeBananaLegacyTypeByCanonicalKind[node.kind as CanonicalNodeKind]
      ?? node.runtimeNode?.type
      ?? node.kind;
    const data = projectNodeData(node, incoming, options);
    if (node.kind === "process.promptConstructor" || node.kind === "input.prompt") {
      try {
        const text = resolveGraphText(normalized, node.id);
        if (node.kind === "process.promptConstructor") data.outputText = text || null;
        else data.resolvedPrompt = text;
      } catch { data.outputText = null; data.error = "Unable to resolve prompt inputs."; }
    }
    return {
      ...(node.runtimeNode ?? {}),
      id: node.id,
      type: legacyType,
      position: node.position,
      data,
    };
  });

  const nodeById = new Map(normalized.nodes.map((node) => [node.id, node]));
  const edges: NodeBananaUpstreamEdge[] = normalized.edges.map((edge) => {
    const sourceKind = nodeById.get(edge.sourceNodeId)?.kind ?? "";
    const targetKind = nodeById.get(edge.targetNodeId)?.kind ?? "";
    const sourceHandle = upstreamHandleForCanonicalPort(sourceKind, "output", edge.sourcePortId, edge.sortOrder);
    const targetHandle = upstreamHandleForCanonicalPort(targetKind, "input", edge.targetPortId, edge.sortOrder);
    const data: Record<string, unknown> & NodeBananaUpstreamEdge["data"] = {
      ...(edge.runtimeEdge?.data ?? {}),
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      sortOrder: edge.sortOrder,
      hasPause: edge.hasPause,
      createdAt: edge.runtimeEdge?.data?.createdAt ?? edge.sortOrder,
      _adapterIndex: edge.originalIndex,
    };
    return {
      ...(edge.runtimeEdge ?? {}),
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle,
      targetHandle,
      data,
    };
  });

  const connected = (nodeId: string) => makeConnectedInputs(nodeId, nodes, edges);
  nodes = nodes.map((node) => {
    const values = valuesForNode(node.id, edges, new Map(nodes.map((candidate) => [candidate.id, candidate])));
    projectConnectedFields(node, connected, values);
    if (node.data.canonicalKind === "input.image") {
      const sources = new Map(nodes.map((candidate) => [candidate.id, candidate]));
      const linked = edges.some((edge) => edge.target === node.id &&
        edge.data.targetPortId === "reference" && !edge.data.isLoop && !isSplitCellReference(edge, sources));
      node.data.hasConnectedImage = linked;
      if (linked) {
        const image = sourceValuesFor(node, "image", sources, edges, new Set()).find((value) => value.type === "image");
        node.data.image = image?.value ?? null;
        node.data.imageRef = image?.assetId ?? null;
        node.data.filename = null;
        node.data.dimensions = null;
      }
    }
    return node;
  });

  return { nodes, edges, getConnectedInputs: connected };
}

/** Explicit alias for callers whose input is known to be canonical. */
export const adaptCanonicalGraphToNodeBananaHost = adaptNodeBananaHostGraph;

/** Explicit alias for callers that already call this boundary a runtime adapter. */
export const createNodeBananaHostAdapter = adaptNodeBananaHostGraph;

/** Public app-side entrypoint name for callers that say "upstream graph". */
export const adaptCanonicalGraphToUpstream = adaptNodeBananaHostGraph;

/** Default export keeps the adapter easy to inject into a host boundary. */
export default adaptNodeBananaHostGraph;

export const nodeBananaCanonicalKinds = canonicalNodeKinds;
