import type { Connection, XYPosition } from "@xyflow/react";

import type {
  NodeBananaPendingConnection,
  NodeBananaRuntimeEdge,
  NodeBananaRuntimeGraph,
  NodeBananaRuntimeNode,
  NodeBananaRuntimePaletteItem,
} from "@node-banana-runtime/runtime-entry";
import {
  analyzeCanonicalGraphSupport,
  pruneGroupsAfterNodeDeletion,
  type CanonicalEdge,
  type CanonicalJsonValue,
  type CanonicalNode,
  type GraphDocumentV3,
} from "@/shared/generation-graph/canonical-graph";
import type {
  DurableEditorCommand,
  EditorRuntimeAdapter,
  NodeExecutionEvent,
} from "@/shared/generation-graph/editor-runtime";
import {
  canonicalNodeKinds,
  findNodeDefinition,
  findPortDefinition,
  type CanonicalNodeKind,
  type PortDefinition,
} from "@/shared/generation-graph/node-registry";

import type {
  GenerationGraphSnapshotDto,
  JsonValue,
  UpdateGenerationGraphDto,
} from "../../model/graph-types";
import { nodeBananaNodeGeometry } from "../../model/node-banana-node-inventory";

export type NodeBananaNodeData = Record<string, unknown> & {
  canonicalKind: string;
  configVersion: number;
  config: CanonicalJsonValue;
  selectedOutputAssetId: string | null;
  ports: readonly PortDefinition[];
  supported: boolean;
  supportReason: string | null;
  executionStatus?: NodeExecutionEvent["status"];
  executionProgress?: number;
};

const runtimeTypeForKind = (kind: string) =>
  kind.startsWith("generate.") ? "generationNode" : findNodeDefinition(kind) ? "canonicalNode" : "unsupportedNode";

const canonicalToRuntimeHandle = (
  kind: string,
  direction: PortDefinition["direction"],
  portId: string,
  sortOrder = 0,
) => {
  if (kind === "generate.image") {
    if (direction === "input" && portId === "prompt") return "text";
    if (direction === "input" && (portId === "primary" || portId === "references")) return "image";
    if (direction === "output" && portId === "image") return "image";
  }
  if (
    (kind === "generate.audio" || kind === "generate.video") &&
    direction === "input" &&
    portId === "prompt"
  ) return "text";
  if (kind === "generate.video" && direction === "input" && portId === "initImage") return "image";
  if (kind === "edit.image.splitGrid" && direction === "output" && portId === "images") return "reference";
  if (kind === "edit.video.easeCurve" && (direction === "input" || direction === "output") && portId === "settings") {
    return "easeCurve";
  }
  if (kind === "inspect.imageCompare" && direction === "input") {
    if (portId === "before") return "image";
    if (portId === "after") return "image-1";
  }
  if (kind === "edit.image.gif" && direction === "input" && portId === "frames") {
    return `image-${sortOrder}`;
  }
  if (kind === "edit.video.stitch" && direction === "input" && portId === "clips") {
    return `video-${sortOrder}`;
  }
  return portId;
};

const runtimeToCanonicalHandle = (
  kind: string,
  direction: PortDefinition["direction"],
  handleId: string | null | undefined,
) => {
  if (!handleId) return "";
  if (kind === "generate.image") {
    if (direction === "input" && handleId === "text") return "prompt";
    if (direction === "input" && handleId === "image") return "primary";
    if (direction === "input" && handleId === "reference") return "references";
    if (direction === "output" && (handleId === "image" || handleId === "output")) return "image";
  }
  if (
    (kind === "generate.audio" || kind === "generate.video") &&
    direction === "input" &&
    handleId === "text"
  ) return "prompt";
  if (kind === "generate.video" && direction === "input" && handleId === "image") return "initImage";
  if (kind === "edit.image.splitGrid" && direction === "output" && handleId === "reference") return "images";
  if (kind === "edit.video.easeCurve" && (direction === "input" || direction === "output") && handleId === "easeCurve") {
    return "settings";
  }
  if (kind === "inspect.imageCompare" && direction === "input") {
    if (handleId === "image") return "before";
    if (handleId === "image-1") return "after";
  }
  if (kind === "edit.image.gif" && direction === "input" && /^image-\d+$/.test(handleId)) return "frames";
  if (kind === "edit.video.stitch" && direction === "input" && /^video-\d+$/.test(handleId)) return "clips";
  return handleId;
};

function runtimeNodeData(node: CanonicalNode): NodeBananaNodeData {
  const definition = findNodeDefinition(node.kind);
  return {
    canonicalKind: node.kind,
    configVersion: node.configVersion,
    config: node.config,
    selectedOutputAssetId: node.selectedOutputAssetId,
    ports: definition?.ports ?? [],
    supported: Boolean(definition && definition.configVersion === node.configVersion),
    supportReason: definition ? (definition.configVersion === node.configVersion ? null : "UNKNOWN_CONFIG_VERSION") : "UNKNOWN_NODE_KIND",
  };
}

export function graphSnapshotToCanonicalDocument(graph: GenerationGraphSnapshotDto): GraphDocumentV3 {
  return {
    schemaVersion: 3,
    minimumWriterVersion: 3,
    groups: graph.groups,
    id: graph.id,
    version: graph.version,
    title: graph.title,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      position: node.position,
      configVersion: node.configVersion,
      config: node.config as CanonicalJsonValue,
      selectedOutputAssetId: node.selectedOutputAssetId,
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function canonicalDocumentToV3Draft(
  graph: GraphDocumentV3,
): Omit<UpdateGenerationGraphDto, "expectedVersion"> {
  return {
    schemaVersion: 3,
    groups: graph.groups,
    title: graph.title,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      position: node.position,
      configVersion: node.configVersion,
      config: node.config as JsonValue,
      selectedOutputAssetId: node.selectedOutputAssetId,
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function canonicalDocumentToRuntimeGraph(graph: GraphDocumentV3): NodeBananaRuntimeGraph {
  const nodes: NodeBananaRuntimeNode[] = graph.nodes.map((node) => {
    const geometry = nodeBananaNodeGeometry[node.kind as CanonicalNodeKind];
    return {
      id: node.id,
      type: runtimeTypeForKind(node.kind),
      position: node.position,
      data: runtimeNodeData(node),
      ...(geometry ? {
        width: geometry.width,
        height: geometry.height,
        style: { width: geometry.width, height: geometry.height },
      } : {}),
    };
  });
  const kindById = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const edges: NodeBananaRuntimeEdge[] = graph.edges.map((edge) => {
    const sourceKind = kindById.get(edge.sourceNodeId) ?? "";
    const targetKind = kindById.get(edge.targetNodeId) ?? "";
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(sourceKind === "edit.image.splitGrid" && targetKind === "input.image" && edge.targetPortId === "reference"
        ? { type: "reference" } : {}),
      sourceHandle: canonicalToRuntimeHandle(sourceKind, "output", edge.sourcePortId),
      targetHandle: canonicalToRuntimeHandle(targetKind, "input", edge.targetPortId, edge.sortOrder),
      data: {
        sourcePortId: edge.sourcePortId,
        targetPortId: edge.targetPortId,
        sortOrder: edge.sortOrder,
        hasPause: edge.hasPause ?? false,
      },
      ariaLabel: `${edge.sourcePortId} to ${edge.targetPortId}`,
      style: {
        stroke: edge.hasPause
          ? "#ea580c"
          : edge.targetPortId === "primary" || edge.targetPortId === "references"
            ? "var(--primary)"
            : "rgba(255,255,255,0.48)",
        strokeWidth: 2,
      },
    };
  });
  return { nodes, edges, groups: graph.groups };
}

function nodeData(node: NodeBananaRuntimeNode) {
  return node.data as NodeBananaNodeData;
}

type RuntimeModelCapabilities = {
  imageInputLimit: (modelKey: string | null) => number;
  videoSupportsInitImage: (modelKey: string | null) => boolean;
};

function configModelKey(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  return typeof (config as Record<string, unknown>).modelKey === "string"
    ? (config as Record<string, unknown>).modelKey as string
    : null;
}

export function reconcileRuntimeEdgesForModelChange(
  runtime: NodeBananaRuntimeGraph,
  nodeId: string,
  nextConfig: unknown,
  capabilities: RuntimeModelCapabilities,
) {
  const node = runtime.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return runtime.edges;
  const data = nodeData(node);
  const previousModelKey = configModelKey(data.config);
  const nextModelKey = configModelKey(nextConfig);
  if (previousModelKey === nextModelKey) return runtime.edges;

  if (data.canonicalKind === "generate.image") {
    const limit = Math.max(0, capabilities.imageInputLimit(nextModelKey));
    let accepted = 0;
    return runtime.edges.filter((edge) => {
      const isImageInput = edge.target === nodeId && (
        edge.targetHandle === "image" ||
        edge.data?.targetPortId === "primary" ||
        edge.data?.targetPortId === "references"
      );
      if (!isImageInput) return true;
      accepted += 1;
      return accepted <= limit;
    });
  }

  if (
    data.canonicalKind === "generate.video" &&
    !capabilities.videoSupportsInitImage(nextModelKey)
  ) {
    return runtime.edges.filter((edge) => !(
      edge.target === nodeId &&
      (edge.targetHandle === "image" || edge.data?.targetPortId === "initImage")
    ));
  }

  return runtime.edges;
}

export function runtimeGraphToCanonicalDocument(
  base: GraphDocumentV3,
  runtime: NodeBananaRuntimeGraph,
): GraphDocumentV3 {
  const nodes = runtime.nodes.map<CanonicalNode>((node) => {
    const data = nodeData(node);
    return {
      id: node.id,
      kind: data.canonicalKind,
      position: node.position,
      configVersion: data.configVersion,
      config: data.config,
      selectedOutputAssetId: data.selectedOutputAssetId,
    };
  });
  const nodeById = new Map(runtime.nodes.map((node) => [node.id, node]));
  const orderByTarget = new Map<string, number>();
  const imageInputsByTarget = new Map<string, { primary: boolean; references: number }>();
  const edges = runtime.edges.map<CanonicalEdge>((edge) => {
    const sourceKind = nodeData(nodeById.get(edge.source) as NodeBananaRuntimeNode).canonicalKind;
    const targetKind = nodeData(nodeById.get(edge.target) as NodeBananaRuntimeNode).canonicalKind;
    const sourcePortId = String(edge.data?.sourcePortId ?? runtimeToCanonicalHandle(sourceKind, "output", edge.sourceHandle));
    let targetPortId = String(edge.data?.targetPortId ?? runtimeToCanonicalHandle(targetKind, "input", edge.targetHandle));
    if (!edge.data?.targetPortId && targetKind === "generate.image" && edge.targetHandle === "image") {
      const usage = imageInputsByTarget.get(edge.target) ?? { primary: false, references: 0 };
      targetPortId = usage.primary ? "references" : "primary";
    }
    if (targetKind === "generate.image" && (targetPortId === "primary" || targetPortId === "references")) {
      const usage = imageInputsByTarget.get(edge.target) ?? { primary: false, references: 0 };
      if (targetPortId === "primary") usage.primary = true;
      else usage.references += 1;
      imageInputsByTarget.set(edge.target, usage);
    }
    const key = `${edge.target}:${targetPortId}`;
    const fallbackOrder = orderByTarget.get(key) ?? 0;
    orderByTarget.set(key, fallbackOrder + 1);
    const ordered = findPortDefinition(targetKind, targetPortId, "input")?.ordered;
    const dynamicOrder = targetKind === "edit.image.gif"
      ? edge.targetHandle?.match(/^image-(\d+)$/)?.[1]
      : targetKind === "edit.video.stitch"
        ? edge.targetHandle?.match(/^video-(\d+)$/)?.[1]
        : undefined;
    return {
      id: edge.id,
      sourceNodeId: edge.source,
      sourcePortId,
      targetNodeId: edge.target,
      targetPortId,
      sortOrder: Number(edge.data?.sortOrder ?? (ordered ? dynamicOrder ?? fallbackOrder : 0)),
      ...(edge.data?.hasPause ? { hasPause: true } : {}),
    };
  });
  const removed = new Set(base.nodes.filter((node) => !nodeById.has(node.id)).map((node) => node.id));
  const groups = pruneGroupsAfterNodeDeletion(runtime.groups ?? base.groups, removed);
  const groupIds = new Set(groups.map((group) => group.id));
  const normalizedNodes = nodes.map((node) => {
    if (node.kind !== "edit.image.splitGrid" || node.configVersion !== 1) return node;
    const config = node.config as Record<string, CanonicalJsonValue>;
    const materialization = config?.materialization as Record<string, CanonicalJsonValue> | undefined;
    if (!materialization || !Array.isArray(materialization.cells)) return node;
    const cells = materialization.cells.map((value) => {
      const cell = value as Record<string, CanonicalJsonValue>;
      return typeof cell.groupId === "string" && !groupIds.has(cell.groupId) ? { ...cell, groupId: null } : cell;
    });
    return { ...node, config: { ...config, materialization: { ...materialization, cells } } };
  });
  return { ...base, nodes: normalizedNodes, edges, groups };
}

function applyDurableCommand(graph: GraphDocumentV3, command: DurableEditorCommand): GraphDocumentV3 {
  switch (command.type) {
    case "node.add":
      return { ...graph, nodes: [...graph.nodes, command.node] };
    case "node.update":
      return {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === command.nodeId ? { ...node, ...command.patch } : node,
        ),
      };
    case "node.remove":
      return {
        ...graph,
        groups: pruneGroupsAfterNodeDeletion(graph.groups, new Set([command.nodeId])),
        nodes: graph.nodes.filter((node) => node.id !== command.nodeId),
        edges: graph.edges.filter(
          (edge) => edge.sourceNodeId !== command.nodeId && edge.targetNodeId !== command.nodeId,
        ),
      };
    case "edge.connect":
      return { ...graph, edges: [...graph.edges, command.edge] };
    case "edge.disconnect":
      return { ...graph, edges: graph.edges.filter((edge) => edge.id !== command.edgeId) };
    case "node.output.select":
      return {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === command.nodeId ? { ...node, selectedOutputAssetId: command.assetId } : node,
        ),
      };
  }
}

export const nodeBananaRuntimeAdapter: EditorRuntimeAdapter<NodeBananaRuntimeGraph> = {
  engineId: "node-banana@1.9.0",
  project(graph) {
    const support = analyzeCanonicalGraphSupport(graph);
    return {
      state: canonicalDocumentToRuntimeGraph(graph),
      writable: support.writable,
      readOnlyReason: support.readOnlyReason,
    };
  },
  applyCommand: applyDurableCommand,
  projectExecutionEvent(state, event) {
    return {
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === event.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                executionStatus: event.status,
                executionProgress: event.progress,
              },
            }
          : node,
      ),
    };
  },
};

export function defaultConfigForKind(kind: CanonicalNodeKind): CanonicalJsonValue {
  if (kind === "process.promptConstructor") return { template: "" };
  if (kind.startsWith("input.")) {
    return kind === "input.prompt" ? { text: "" } : { assetId: null };
  }
  if (kind.startsWith("generate.")) return { prompt: "", modelKey: null, parameters: {} };
  if (kind === "edit.image.removeBackground") return { parameters: { model: "isnet_fp16" } };
  if (kind === "edit.image.resize") {
    return {
      parameters: {
        mode: "exact",
        width: 128,
        height: 128,
        maxEdge: 128,
        scalePct: 100,
        fit: "contain",
        padColor: "#00000000",
        format: "png",
        quality: 0.9,
      },
    };
  }
  if (kind === "edit.image.gif") {
    return { parameters: { fps: 8, loopCount: 0, colorCount: 128, dither: false, targetMaxBytes: 128 * 1024, clipOrder: [] } };
  }
  if (kind === "edit.video.stitch") return { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } };
  if (kind === "edit.video.trim") return { parameters: { startMs: 0, endMs: 5_000, stripAudio: false } };
  if (kind === "edit.video.frameGrab") return { parameters: { position: "first" } };
  if (kind === "edit.video.easeCurve") {
    return {
      parameters: {
        outputDurationMs: 1_500,
        easingPreset: "easeInOutSine",
        bezier: [0.42, 0, 0.58, 1],
      },
    };
  }
  if (kind.startsWith("edit.")) return { parameters: {} };
  if (kind.startsWith("output.")) return { mediaType: null };
  return {};
}

export function createCanonicalRuntimeNode(
  kind: CanonicalNodeKind,
  id: string,
  position: XYPosition,
  initialModelKey?: string,
): NodeBananaRuntimeNode {
  const canonical: CanonicalNode = {
    id,
    kind,
    position,
    configVersion: 1,
    config: kind.startsWith("generate.") && initialModelKey
      ? { prompt: "", modelKey: initialModelKey, parameters: {} }
      : defaultConfigForKind(kind),
    selectedOutputAssetId: null,
  };
  const geometry = nodeBananaNodeGeometry[kind];
  return {
    id,
    position,
    type: runtimeTypeForKind(kind),
    data: runtimeNodeData(canonical),
    width: geometry.width,
    height: geometry.height,
    style: { width: geometry.width, height: geometry.height },
  };
}

function portForPendingConnection(
  graph: NodeBananaRuntimeGraph,
  pending: NodeBananaPendingConnection,
) {
  const node = graph.nodes.find((candidate) => candidate.id === pending.nodeId);
  if (!node) return null;
  const kind = nodeData(node).canonicalKind;
  const direction = pending.handleType === "source" ? "output" : "input";
  const portId = runtimeToCanonicalHandle(kind, direction, pending.handleId);
  return findPortDefinition(kind, portId, direction);
}

function portsCompatible(source: PortDefinition, target: PortDefinition) {
  return source.valueType === target.valueType ||
    (target.valueType === "media" && source.valueType !== "text" && source.valueType !== "media");
}

export function filterPaletteForConnection(
  graph: NodeBananaRuntimeGraph,
  items: readonly NodeBananaRuntimePaletteItem[],
  pending: NodeBananaPendingConnection | null,
) {
  if (!pending) return items;
  const connectedPort = portForPendingConnection(graph, pending);
  if (!connectedPort) return [];
  return items.filter((item) => {
    const definition = findNodeDefinition(item.kind);
    if (!definition) return false;
    const wantedDirection = pending.handleType === "source" ? "input" : "output";
    return definition.ports.some((port) =>
      port.direction === wantedDirection &&
      (pending.handleType === "source"
        ? portsCompatible(connectedPort, port)
        : portsCompatible(port, connectedPort)),
    );
  });
}

export function connectCreatedRuntimeNode(
  graph: NodeBananaRuntimeGraph,
  node: NodeBananaRuntimeNode,
  pending: NodeBananaPendingConnection | null,
  edgeId: string,
): NodeBananaRuntimeEdge | null {
  if (!pending) return null;
  const connectedPort = portForPendingConnection(graph, pending);
  const definition = findNodeDefinition(nodeData(node).canonicalKind);
  if (!connectedPort || !definition) return null;
  const wantedDirection = pending.handleType === "source" ? "input" : "output";
  const port = definition.ports.find((candidate) =>
    candidate.direction === wantedDirection &&
    (pending.handleType === "source"
      ? portsCompatible(connectedPort, candidate)
      : portsCompatible(candidate, connectedPort)),
  );
  if (!port) return null;
  return pending.handleType === "source"
    ? {
        id: edgeId,
        source: pending.nodeId,
        sourceHandle: pending.handleId,
        target: node.id,
        targetHandle: canonicalToRuntimeHandle(nodeData(node).canonicalKind, "input", port.id),
      }
    : {
        id: edgeId,
        source: node.id,
        sourceHandle: canonicalToRuntimeHandle(nodeData(node).canonicalKind, "output", port.id),
        target: pending.nodeId,
        targetHandle: pending.handleId,
      };
}

export function isRuntimeConnectionValid(
  base: GraphDocumentV3,
  runtime: NodeBananaRuntimeGraph,
  connection: Connection | NodeBananaRuntimeEdge,
  capabilities?: RuntimeModelCapabilities,
) {
  if (!connection.source || !connection.target) return false;
  const target = runtime.nodes.find((node) => node.id === connection.target);
  if (!target) return false;
  const targetData = nodeData(target);
  const targetConfig = targetData.config && typeof targetData.config === "object" && !Array.isArray(targetData.config)
    ? targetData.config as Record<string, unknown>
    : {};
  const modelKey = typeof targetConfig.modelKey === "string" ? targetConfig.modelKey : null;
  if (targetData.canonicalKind === "generate.image" && connection.targetHandle === "image") {
    const limit = capabilities?.imageInputLimit(modelKey) ?? Number.POSITIVE_INFINITY;
    const connected = runtime.edges.filter((edge) =>
      edge.target === connection.target &&
      (edge.targetHandle === "image" || edge.data?.targetPortId === "primary" || edge.data?.targetPortId === "references"),
    ).length;
    if (limit <= connected) return false;
  }
  if (
    targetData.canonicalKind === "generate.video" &&
    connection.targetHandle === "image" &&
    capabilities &&
    !capabilities.videoSupportsInitImage(modelKey)
  ) return false;
  const candidate: NodeBananaRuntimeEdge = {
    id: "runtime_connection_candidate",
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  };
  const canonical = runtimeGraphToCanonicalDocument(base, {
    ...runtime,
    edges: [...runtime.edges, candidate],
  });
  return analyzeCanonicalGraphSupport(canonical).writable;
}

export const nodeBananaPaletteKinds = canonicalNodeKinds;
