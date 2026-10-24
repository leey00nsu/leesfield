import { analyzeCanonicalGraphSupport, graphDocumentV3Schema, type CanonicalEdge, type CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { isTemporarilyHiddenEditNodeKind, isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { canonicalNodeKinds, findNodeDefinition, findPortDefinition, videoCaptureOutputPortId, type PortDefinition } from "@/shared/generation-graph/node-registry";
import { videoFrameOutputPortIds } from "@/shared/generation-graph/video-frame-extraction";
import { isDirectEditPort } from "@/shared/media-assets/direct-media-edit";
import { cinemaPromptField } from "@/shared/cinema/cinema-model-support";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { fileInputLabel } from "@/shared/model-catalog/file-input-presentation";
import { resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage,
  type RuntimeAudioModel, type RuntimeImageModel, type RuntimeLlmModel, type RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import { promptPresetRefSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { promptPresetReferenceImageCount } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { getSpacePortLabel } from "./space-editor-catalog";
import { spaceGenerationAttachmentSlots, type SpaceGenerationModel } from "./space-editor-attachments";
import { SpaceInputResolver, type SpaceInputRuntime } from "./space-editor-inputs";
import type { SpaceEditorDocument, SpacePortReference } from "./space-editor-types";

export type SpaceModelCatalog = {
  imageModels: readonly RuntimeImageModel[];
  videoModels?: readonly RuntimeVideoModel[];
  audioModels?: readonly RuntimeAudioModel[];
  llmModels?: readonly RuntimeLlmModel[];
};
export type SpaceNodePort = {
  definition: PortDefinition;
  label: string;
  connectable: boolean;
  /** Legacy aliases retain handles at the visible field's anchor, never extra controls. */
  visible: boolean;
  anchorPortId: string;
};
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function selectedSpaceGenerationModel(node: CanonicalNode, catalog: SpaceModelCatalog): SpaceGenerationModel | undefined {
  const key = record(node.config).modelKey;
  const models = node.kind === "generate.image" ? catalog.imageModels : node.kind === "generate.video" ? catalog.videoModels : node.kind === "generate.audio" ? catalog.audioModels : undefined;
  return models?.find(model => model.key === key);
}

/** Handle encoding is local-only. Canonical edge port IDs are never rewritten on reads. */
export function spaceHandleId(port: Pick<SpacePortReference, "portId" | "direction" | "slot">) {
  // Flow embeds handle IDs in a quoted CSS selector during pointer hit testing.
  return encodeURIComponent(JSON.stringify([port.direction, port.portId, port.slot ?? null]));
}
export function spacePortFromHandle(nodeId: string, handle: string | null | undefined): SpacePortReference | null {
  if (!handle) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(handle));
    if (!Array.isArray(value) || value.length !== 3 || !["input", "output"].includes(value[0])
      || typeof value[1] !== "string" || !value[1] || value[1].length > 128
      || !(value[2] === null || (Number.isSafeInteger(value[2]) && value[2] >= 0 && value[2] < 1000))) return null;
    return { nodeId, direction: value[0], portId: value[1], ...(value[2] === null ? {} : { slot: value[2] }) };
  } catch { return null; }
}

export function spaceNodePorts(document: SpaceEditorDocument, nodeId: string, catalog: SpaceModelCatalog): SpaceNodePort[] {
  const node = document.nodes.find(item => item.id === nodeId);
  const definition = node && findNodeDefinition(node.kind);
  if (!node || !definition || isTemporarilyHiddenEditNodeKind(node.kind)) return [];
  const config = record(node.config);
  const retired = isUnavailableEditNodeKind(node.kind);
  const model = selectedSpaceGenerationModel(node, catalog);
  const slots = model ? spaceGenerationAttachmentSlots(model) : [];
  const contract = model ? getGradioContract(model) : null;
  const preset = promptPresetRefSchema.safeParse(config.promptPreset);
  const presetImages = preset.success ? promptPresetReferenceImageCount(preset.data) : null;
  const ports = [...definition.ports];
  for (const slot of slots) {
    for (const id of slot.ports) {
      if (ports.some(port => port.direction === "input" && port.id === id)) continue;
      const port = findPortDefinition(node.kind, id, "input");
      if (port) ports.push({ ...port, required: slot.field.required, minConnections: slot.field.required ? 1 : 0,
        maxConnections: slot.limit, edgeCardinality: slot.limit === 1 ? "one" : "many" });
    }
  }
  // Saved connections remain visible/readable even while a model is absent or changed.
  for (const edge of document.edges) {
    const id = edge.targetNodeId === nodeId ? edge.targetPortId : edge.sourceNodeId === nodeId ? edge.sourcePortId : null;
    const direction = edge.targetNodeId === nodeId ? "input" : "output";
    if (id && !ports.some(port => port.id === id && port.direction === direction)) {
      const port = findPortDefinition(node.kind, id, direction);
      if (port) ports.push(port);
    }
  }
  return ports.map(port => {
    const slot = port.direction === "input" ? slots.find(slot => slot.ports.includes(port.id)) : undefined;
    let connectable = !retired;
    let visible = true;
    let anchorPortId = port.id;
    if (port.direction === "output" && (port.id === videoCaptureOutputPortId || isDirectEditPort(port.id))) {
      connectable = false;
      visible = document.edges.some(edge => edge.sourceNodeId === nodeId && edge.sourcePortId === port.id);
    } else if (node.kind === "edit.video.extractFrames" && port.direction === "output") {
      const active = videoFrameOutputPortIds(node.config).some(id => id === port.id);
      connectable &&= active;
      visible = active || document.edges.some(edge => edge.sourceNodeId === nodeId && edge.sourcePortId === port.id);
    } else if (node.kind === "generate.assistant") {
      const llm = catalog.llmModels?.find(model => model.key === config.modelKey);
      if (["images", "videos"].includes(port.id)) connectable &&= Boolean(llm?.providerConfig.supports_images);
      if (port.id === "item") visible = config.outputMode === "list";
    } else if (node.kind.startsWith("generate.") && port.direction === "input") {
      if (port.valueType === "text") connectable &&= !model || cinemaPromptField(model).supported;
      if (["image", "video", "audio"].includes(port.valueType)) {
        if (presetImages === 0) connectable = false;
        else if (contract) connectable &&= Boolean(slot);
        else if (node.kind === "generate.image") connectable &&= Math.max(presetImages ?? 0, resolveRuntimeImageMaxInputImages(model?.type === "image" ? model : undefined)) > 0;
        else if (node.kind === "generate.video") connectable &&= Boolean(presetImages || resolveRuntimeVideoSupportsInitImage(model?.type === "video" ? model : undefined));
        else connectable = false;
      }
      if (slot) { anchorPortId = slot.ports[0]; visible = port.id === anchorPortId; }
      else if (node.kind === "generate.image" && port.id === "references") { anchorPortId = "primary"; visible = false; }
      const connected = document.edges.some(edge => edge.targetNodeId === nodeId && edge.targetPortId === port.id);
      if (!connectable && !connected) visible = false;
    }
    return { definition: port, label: slot ? fileInputLabel(slot.field, "en") : getSpacePortLabel(node.kind, port), connectable, visible, anchorPortId };
  });
}

export function compatibleSpaceNodeKinds(port: PortDefinition) {
  return canonicalNodeKinds.filter(kind => !isUnavailableEditNodeKind(kind) && findNodeDefinition(kind)?.ports.some(candidate =>
    candidate.id !== videoCaptureOutputPortId && !isDirectEditPort(candidate.id) && candidate.direction !== port.direction && (candidate.valueType === port.valueType || candidate.valueType === "media" || port.valueType === "media")));
}

export type SpaceConnectionResult = { valid: true; edge: CanonicalEdge } | { valid: false; reason: string };
export function spaceConnectionForPorts(
  document: SpaceEditorDocument, from: SpacePortReference, to: SpacePortReference,
  catalog: SpaceModelCatalog, id: string, runtime: SpaceInputRuntime = {},
): SpaceConnectionResult {
  if (from.direction === to.direction) return { valid: false, reason: "PORT_DIRECTION" };
  const source = from.direction === "output" ? from : to;
  const initialTarget = from.direction === "input" ? from : to;
  const sourceNode = document.nodes.find(node => node.id === source.nodeId);
  const targetNode = document.nodes.find(node => node.id === initialTarget.nodeId);
  if (!sourceNode || !targetNode || source.nodeId === initialTarget.nodeId) return { valid: false, reason: "EDGE_ENDPOINT" };
  if (isUnavailableEditNodeKind(sourceNode.kind) || isUnavailableEditNodeKind(targetNode.kind)) return { valid: false, reason: "NODE_UNAVAILABLE" };
  // A shared legacy Image anchor chooses primary for the first NEW edge only.
  const target = targetNode.kind === "generate.image" && initialTarget.portId === "primary"
    && !getGradioContract(selectedSpaceGenerationModel(targetNode, catalog) ?? {})
    && document.edges.some(edge => edge.targetNodeId === targetNode.id && edge.targetPortId === "primary")
    ? { ...initialTarget, portId: "references" } : initialTarget;
  const sourcePort = spaceNodePorts(document, sourceNode.id, catalog).find(port => port.definition.direction === "output" && port.definition.id === source.portId);
  const targetPort = spaceNodePorts(document, targetNode.id, catalog).find(port => port.definition.direction === "input" && port.definition.id === target.portId);
  if (!sourcePort?.connectable || !targetPort?.connectable) return { valid: false, reason: "PORT_UNSUPPORTED" };
  const incoming = document.edges.filter(edge => edge.targetNodeId === target.nodeId && edge.targetPortId === target.portId);
  const sortOrder = target.slot ?? Math.max(-1, ...incoming.map(edge => edge.sortOrder)) + 1;
  const edge: CanonicalEdge = { id, sourceNodeId: source.nodeId, sourcePortId: source.portId, targetNodeId: target.nodeId, targetPortId: target.portId, sortOrder };
  const graph = { schemaVersion: 3 as const, minimumWriterVersion: 3 as const, id: "connection_check", version: 1,
    title: document.title, nodes: document.nodes, groups: document.groups, edges: [...document.edges, edge] };
  if (!graphDocumentV3Schema.safeParse(graph).success) return { valid: false, reason: "SPACE_GRAPH_LIMIT" };
  const support = analyzeCanonicalGraphSupport(graph);
  if (!support.writable) return { valid: false, reason: support.readOnlyReason ?? "CONNECTION_INVALID" };
  const model = selectedSpaceGenerationModel(targetNode, catalog);
  const slots = model ? spaceGenerationAttachmentSlots(model) : [];
  const slot = slots.find(slot => slot.ports.includes(target.portId));
  if (slot) {
    const resolver = new SpaceInputResolver(document, runtime);
    const used = document.edges.filter(edge => edge.targetNodeId === target.nodeId && slot.ports.includes(edge.targetPortId))
      .reduce((count, edge) => count + Math.max(1, resolver.sourceAssetIds(edge.sourceNodeId, edge.sourcePortId).length), 0);
    const added = Math.max(1, resolver.sourceAssetIds(source.nodeId, source.portId).length);
    const positional = slot.ports[0] !== "primary" && slot.ports[0] !== "initImage";
    if (used + added > slot.limit || (positional && edge.sortOrder + added > slot.limit)
      || (target.slot !== undefined && target.slot >= slot.limit)) return { valid: false, reason: "ATTACHMENT_LIMIT" };
  }
  return { valid: true, edge };
}

/** Preserve preset-authored edges; only explicit legacy model changes reconcile old image inputs. */
export function reconcileSpaceModelEdges(document: SpaceEditorDocument, nodeId: string, nextConfig: unknown, catalog: SpaceModelCatalog): readonly CanonicalEdge[] {
  const node = document.nodes.find(node => node.id === nodeId);
  if (!node) return document.edges;
  const before = record(node.config), after = record(nextConfig);
  if (before.modelKey === after.modelKey || promptPresetRefSchema.safeParse(before.promptPreset).success || promptPresetRefSchema.safeParse(after.promptPreset).success) return document.edges;
  if (node.kind === "generate.image") {
    const model = catalog.imageModels.find(model => model.key === after.modelKey);
    const contract = model && getGradioContract(model);
    const imageSlots = model && contract ? spaceGenerationAttachmentSlots(model).filter(slot => slot.field.media === "image") : [];
    // Multiple named fields cannot be inferred from old unnamed references. Keep them for explicit reassignment.
    if (imageSlots.length > 1) return document.edges;
    const limit = contract ? imageSlots[0]?.limit ?? 0 : Math.max(0, resolveRuntimeImageMaxInputImages(model));
    let accepted = 0;
    const edges = document.edges.filter(edge => !(edge.targetNodeId === nodeId && ["primary", "references"].includes(edge.targetPortId)) || ++accepted <= limit);
    return edges.length === document.edges.length ? document.edges : edges;
  }
  if (node.kind === "generate.video") {
    const model = catalog.videoModels?.find(model => model.key === after.modelKey);
    const supports = model && getGradioContract(model)
      ? spaceGenerationAttachmentSlots(model).some(slot => slot.field.media === "image")
      : resolveRuntimeVideoSupportsInitImage(model);
    if (!supports) {
      const edges = document.edges.filter(edge => !(edge.targetNodeId === nodeId && edge.targetPortId === "initImage"));
      return edges.length === document.edges.length ? document.edges : edges;
    }
  }
  return document.edges;
}
