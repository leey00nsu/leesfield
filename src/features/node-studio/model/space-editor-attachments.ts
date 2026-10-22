import type { CanonicalEdge, CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { pairedAudioField, reorderPairedSlots, assertPairedInputValues } from "@/shared/model-catalog/attachment-relationships";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { fileFieldInputPorts } from "@/shared/model-catalog/file-input-ports";
import { getGradioContract, fileFieldMaxItems, type GradioField } from "@/shared/model-catalog/gradio-contract";
import { resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage,
  type RuntimeAudioModel, type RuntimeImageModel, type RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import type { SpaceEditorDocument } from "./space-editor-types";
import { SpaceInputResolver, equalSpaceAssetIds, type SpaceInputRuntime } from "./space-editor-inputs";

export type SpaceAttachmentSlot = { field: GradioField; ports: string[]; limit: number };
export type SpaceGenerationModel = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;

function record(value: unknown): Record<string, CanonicalJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, CanonicalJsonValue> : {};
}

export function spaceGenerationAttachmentSlots(model: SpaceGenerationModel): SpaceAttachmentSlot[] {
  const contract = getGradioContract(model);
  if (contract) return contract.inputs.filter(field => !field.hidden && ["file", "files", "gallery"].includes(field.kind) && field.media)
    .map(field => ({ field, ports: fileFieldInputPorts(contract, field), limit: fileFieldMaxItems(field) }));
  const limit = model.type === "image" ? resolveRuntimeImageMaxInputImages(model)
    : model.type === "video" && resolveRuntimeVideoSupportsInitImage(model) ? 1 : 0;
  return limit ? [{ field: { name: "reference", label: "Reference", kind: limit > 1 ? "files" : "file",
    media: "image", required: false, nullable: false, schema: { maxItems: limit } },
    ports: model.type === "image" ? ["primary", "references"] : ["initImage"], limit }] : [];
}

export function spaceAttachmentAssetIds(resolver: SpaceInputResolver, nodeId: string, slot: SpaceAttachmentSlot): readonly (string | null)[] {
  return slot.ports.flatMap(port => fileFieldAllowsNullItems(slot.field)
    ? [...resolver.inputAssetSlots(nodeId, port)] : [...resolver.inputAssetIds(nodeId, port)]);
}

function attachmentSourceEdges(resolver: SpaceInputResolver, nodeId: string, slot: SpaceAttachmentSlot): (string | undefined)[] {
  const positional = fileFieldAllowsNullItems(slot.field);
  return slot.ports.flatMap(port => {
    const result: (string | undefined)[] = positional ? Array.from({ length: resolver.inputAssetSlots(nodeId, port).length }) : [];
    for (const edge of resolver.incomingEdges(nodeId, port)) {
      const values = resolver.edgeAssetIds(edge);
      values.forEach((_, index) => { if (positional) result[edge.sortOrder + index] = edge.id; else result.push(edge.id); });
    }
    return result;
  });
}

/** Prepare one canonical transaction; source nodes and unrelated edges remain intact. */
export function replaceSpaceGenerationAttachments(
  document: SpaceEditorDocument,
  nodeId: string,
  slot: SpaceAttachmentSlot,
  assetIds: readonly (string | null)[],
  createId: () => string,
  runtime: SpaceInputRuntime = {},
  sourceOrder?: { edgeIds: readonly (string | undefined)[]; force: boolean },
): SpaceEditorDocument {
  const target = document.nodes.find(node => node.id === nodeId);
  if (!target || !target.kind.startsWith("generate.") || target.kind === "generate.assistant"
    || isUnavailableEditNodeKind(target.kind) || !slot.field.media || !slot.ports.length) throw new Error("ATTACHMENT_MEDIA");
  const resolver = new SpaceInputResolver(document, runtime);
  const positional = fileFieldAllowsNullItems(slot.field);
  const previousIds = spaceAttachmentAssetIds(resolver, nodeId, slot);
  const removing = assetIds.length < previousIds.length && assetIds.every(id => previousIds.includes(id));
  if (assetIds.length > slot.limit && !removing) throw new Error("ATTACHMENT_LIMIT");
  if (assetIds.some(id => id === null ? !positional : !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error("ATTACHMENT_MEDIA");
  const matches = (edge: CanonicalEdge) => edge.targetNodeId === nodeId && slot.ports.includes(edge.targetPortId);
  const inputEdges = document.edges.filter(matches).sort((a, b) => a.sortOrder - b.sortOrder);
  const authored = record(target.config), parameters = record(authored.parameters), dynamic = record(parameters.dynamicParams);
  const marker = Object.hasOwn(dynamic, slot.field.name) ? dynamic[slot.field.name] : undefined;
  const markerMatches = !positional || Array.isArray(marker) && marker.length === assetIds.length && marker.every(value => value === null);
  // Keep an untouched ordered collection as one live connection; expanding it into every displayed asset would duplicate outputs.
  if (!sourceOrder?.force && equalSpaceAssetIds(previousIds, assetIds)
    && inputEdges.every(edge => edge.targetPortId === slot.ports[0])) {
    if (markerMatches) return document;
    return { ...document, nodes: document.nodes.map(node => node.id !== nodeId ? node : { ...node, config: {
      ...authored, parameters: { ...parameters, dynamicParams: { ...dynamic, [slot.field.name]: assetIds.map(() => null) } },
    } }) };
  }
  const unused = [...inputEdges];
  const nodes = [...document.nodes];
  const replacement: CanonicalEdge[] = [];
  const media = slot.field.media;
  assetIds.forEach((assetId, index) => {
    if (assetId === null) return;
    const port = slot.ports.length === 2 && slot.ports[0] === "primary" ? (index === 0 ? "primary" : "references") : slot.ports[0];
    const found = unused.findIndex(edge => {
      const values = resolver.edgeAssetIds(edge);
      return values.length === 1 && values[0] === assetId && (!sourceOrder || edge.id === sourceOrder.edgeIds[index]);
    });
    if (found >= 0) {
      const [edge] = unused.splice(found, 1);
      replacement.push(edge.targetPortId === port && edge.sortOrder === index ? edge : { ...edge, targetPortId: port, sortOrder: index });
    } else {
      const id = createId();
      nodes.push({ id, kind: `input.${media}`, configVersion: 1,
        position: { x: target.position.x - 560, y: target.position.y + index * 120 },
        config: { assetId }, selectedOutputAssetId: null });
      replacement.push({ id: createId(), sourceNodeId: id, sourcePortId: media, targetNodeId: nodeId, targetPortId: port, sortOrder: index });
    }
  });
  let markerChanged = false;
  if (positional) {
    const index = nodes.findIndex(node => node.id === nodeId);
    const config = record(nodes[index].config);
    const parameters = record(config.parameters);
    const dynamic = record(parameters.dynamicParams);
    const marker = Object.hasOwn(dynamic, slot.field.name) ? dynamic[slot.field.name] : undefined;
    if (!Array.isArray(marker) || marker.length !== assetIds.length || marker.some(value => value !== null)) {
      markerChanged = true;
      nodes[index] = { ...nodes[index], config: { ...config, parameters: { ...parameters,
        dynamicParams: { ...dynamic, [slot.field.name]: assetIds.map(() => null) } } } };
    }
  }
  if (!markerChanged && nodes.length === document.nodes.length && unused.length === 0
    && inputEdges.length === replacement.length && replacement.every(edge => document.edges.includes(edge))) return document;
  const edges = [...document.edges.filter(edge => !matches(edge)), ...replacement];
  if (nodes.length > 500 || edges.length > 2000 || document.groups.length > 500) throw new Error("SPACE_GRAPH_LIMIT");
  return { ...document, nodes, edges };
}

/** Related positional tracks move with their explicit index mapping, including duplicates. */
export function replaceRelatedSpaceGenerationAttachments(
  document: SpaceEditorDocument, nodeId: string, slots: readonly SpaceAttachmentSlot[], slot: SpaceAttachmentSlot,
  assetIds: readonly (string | null)[], createId: () => string, order?: readonly number[], runtime: SpaceInputRuntime = {},
): SpaceEditorDocument {
  const resolver = new SpaceInputResolver(document, runtime);
  const pairedField = pairedAudioField(slots.map(item => item.field), slot.field.name);
  const paired = slots.find(item => item.field.name === pairedField?.name);
  if (order) {
    const previous = spaceAttachmentAssetIds(resolver, nodeId, slot);
    if (new Set(order).size !== order.length || order.length !== assetIds.length
      || order.some((index, position) => !Number.isInteger(index) || index < 0 || index >= previous.length || previous[index] !== assetIds[position])) throw new Error("ATTACHMENT_ORDER");
  }
  const sourceEdges = order ? attachmentSourceEdges(resolver, nodeId, slot) : [];
  const sourceOrder = order ? { edgeIds: order.map(index => sourceEdges[index]), force: order.some((index, position) => index !== position) } : undefined;
  let next = replaceSpaceGenerationAttachments(document, nodeId, slot, assetIds, createId, runtime, sourceOrder);
  if (paired && order) {
    const pairedEdges = attachmentSourceEdges(resolver, nodeId, paired);
    next = replaceSpaceGenerationAttachments(next, nodeId, paired, reorderPairedSlots([...spaceAttachmentAssetIds(resolver, nodeId, paired)], order), createId, runtime,
      { edgeIds: order.map(index => pairedEdges[index]), force: sourceOrder!.force });
  }
  const nextResolver = new SpaceInputResolver(next, runtime);
  assertPairedInputValues(slots.map(item => item.field), Object.fromEntries(slots.map(item => [item.field.name, spaceAttachmentAssetIds(nextResolver, nodeId, item)])));
  return next;
}

export type SpaceAttachmentExpectation = {
  modelKey: unknown;
  assetIds: readonly (string | null)[];
  relatedAssetIds?: Readonly<Record<string, readonly (string | null)[]>>;
  inputScope?: object;
  inputRevision?: number;
  attachmentScope?: object;
  attachmentRevision?: number;
  attachmentField?: string;
};

/** The resolver must be synchronously updated for every canonical/runtime input change. */
export function captureSpaceAttachmentExpectation(resolver: SpaceInputResolver, nodeId: string, slot: SpaceAttachmentSlot, slots: readonly SpaceAttachmentSlot[]): SpaceAttachmentExpectation {
  return { modelKey: record(resolver.getNode(nodeId)?.config).modelKey, assetIds: spaceAttachmentAssetIds(resolver, nodeId, slot),
    relatedAssetIds: Object.fromEntries(slots.map(item => [item.field.name, spaceAttachmentAssetIds(resolver, nodeId, item)])),
    inputScope: resolver.scope, inputRevision: resolver.inputRevision(nodeId) };
}

/** Async chooser/upload responses patch only if both the model and relevant inputs are current. */
export function spaceAttachmentExpectationMatches(
  document: SpaceEditorDocument, nodeId: string, slot: SpaceAttachmentSlot,
  expected: SpaceAttachmentExpectation,
  slots: readonly SpaceAttachmentSlot[], runtime: SpaceInputRuntime = {},
  currentResolver?: SpaceInputResolver,
) {
  const node = document.nodes.find(item => item.id === nodeId);
  if (!node || record(node.config).modelKey !== expected.modelKey) return false;
  currentResolver?.updateGraph(document, runtime);
  if (expected.inputScope && expected.inputScope !== currentResolver?.scope) return false;
  if (expected.inputRevision !== undefined && expected.inputRevision !== currentResolver?.inputRevision(nodeId)) return false;
  const resolver = currentResolver ?? new SpaceInputResolver(document, runtime);
  if (!equalSpaceAssetIds(spaceAttachmentAssetIds(resolver, nodeId, slot), expected.assetIds)) return false;
  return Object.entries(expected.relatedAssetIds ?? {}).every(([name, ids]) => {
    const related = slots.find(item => item.field.name === name);
    return related !== undefined && equalSpaceAssetIds(spaceAttachmentAssetIds(resolver, nodeId, related), ids);
  });
}
