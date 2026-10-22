import {
  analyzeCanonicalGraphSupport, graphDocumentV3Schema,
  type CanonicalEdge, type CanonicalJsonValue, type CanonicalNode,
} from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import { assertPairedInputValues } from "@/shared/model-catalog/attachment-relationships";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { spaceAttachmentAssetIds, spaceGenerationAttachmentSlots } from "./space-editor-attachments";
import { SpaceInputResolver, type SpaceInputRuntime } from "./space-editor-inputs";
import { selectedSpaceGenerationModel, spaceConnectionForPorts, spaceNodePorts, type SpaceModelCatalog } from "./space-editor-ports";
import type { SpaceEditorDocument, SpacePortReference } from "./space-editor-types";

const validId = (id: string) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
function record(value: CanonicalJsonValue | undefined): Record<string, CanonicalJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function assertWritable(document: SpaceEditorDocument) {
  if (!graphDocumentV3Schema.safeParse({ schemaVersion: document.schemaVersion, title: document.title,
    nodes: document.nodes, edges: document.edges, groups: document.groups, minimumWriterVersion: 3, id: "media_check", version: 1 }).success) {
    throw new Error("SPACE_GRAPH_LIMIT");
  }
  const support = analyzeCanonicalGraphSupport(document);
  if (!support.writable) throw new Error(support.readOnlyReason ?? "CONNECTION_INVALID");
}
function inputNode(id: string, type: MediaType, assetId: string, position: { x: number; y: number }): CanonicalNode {
  return { id, kind: `input.${type}`, configVersion: 1, config: { assetId }, position: { ...position }, selectedOutputAssetId: null };
}

/**
 * Publish the returned document in one user transaction, using the latest document
 * after the caller's async intent check. Only completed durable assets enter here;
 * transfer progress, cancellation and session/revision checks belong to the caller.
 */
export function prepareSpacePortMedia(
  document: SpaceEditorDocument,
  port: SpacePortReference,
  asset: MediaAssetDto,
  position: { x: number; y: number },
  catalog: SpaceModelCatalog,
  createId: () => string,
  runtime: SpaceInputRuntime = {},
): SpaceEditorDocument {
  if (!asset || asset.status !== "completed") throw new Error("MEDIA_ASSET_NOT_READY");
  if (!validId(asset.id)) throw new Error("ATTACHMENT_MEDIA");
  const target = document.nodes.find(node => node.id === port.nodeId);
  if (!target) throw new Error("INPUT_TARGET_CHANGED");
  if (isUnavailableEditNodeKind(target.kind)) throw new Error("NODE_UNAVAILABLE");
  const definition = findNodeDefinition(target.kind);
  const ports = spaceNodePorts(document, target.id, catalog);
  const targetPort = ports.find(candidate => candidate.definition.direction === port.direction && candidate.definition.id === port.portId);
  if (!definition || target.configVersion !== definition.configVersion || !targetPort?.connectable) throw new Error("PORT_UNSUPPORTED");
  const requestedPort = targetPort.definition;
  if (!["image", "audio", "video", "media"].includes(requestedPort.valueType)) throw new Error("PORT_UNSUPPORTED");
  const mime = asset.mimeType.split(";", 1)[0].trim().toLowerCase();
  if (!["image", "audio", "video"].includes(asset.type) || (requestedPort.valueType !== "media" && asset.type !== requestedPort.valueType)
    || !mime.startsWith(`${asset.type}/`) || (requestedPort.acceptedMimeTypes && !requestedPort.acceptedMimeTypes.some(accepted =>
      accepted.endsWith("/*") ? mime.startsWith(accepted.slice(0, -1)) : mime === accepted))) throw new Error("ASSET_MEDIA_TYPE_MISMATCH");
  if (port.slot !== undefined && (!Number.isSafeInteger(port.slot) || port.slot < 0 || port.slot >= 1000)) throw new Error("FILE_SLOT_INDEX_INVALID");

  if (port.direction === "output") {
    if (target.kind !== `input.${asset.type}` || port.portId !== asset.type || port.slot !== undefined) throw new Error("PORT_UNSUPPORTED");
    const authored = record(target.config);
    const config = { ...authored, assetId: asset.id, ...(Object.hasOwn(authored, "resultSource") ? {
      resultSource: { ...record(authored.resultSource), executionId: null, state: "completed" },
    } : {}) };
    const next = { ...document, nodes: document.nodes.map(node => node !== target ? node : { ...node, config, selectedOutputAssetId: null }) };
    assertWritable(next);
    return next;
  }

  const model = selectedSpaceGenerationModel(target, catalog);
  const slots = model ? spaceGenerationAttachmentSlots(model) : [];
  const field = slots.find(slot => slot.ports.includes(port.portId));
  const appendReference = field?.ports[0] === "primary" && field.limit > 1 && port.portId === "primary" && port.slot !== 0
    && document.edges.some(edge => edge.targetNodeId === target.id && edge.targetPortId === "primary");
  const destination = appendReference ? { ...port, portId: "references" } : port;
  const mediaPort = appendReference
    ? ports.find(candidate => candidate.definition.direction === "input" && candidate.definition.id === "references")!.definition
    : requestedPort;
  const single = field ? field.limit === 1 : mediaPort.edgeCardinality === "one";
  if (field && port.slot !== undefined && port.slot >= field.limit) throw new Error("ATTACHMENT_LIMIT");
  if (port.slot !== undefined && single && port.slot !== 0) throw new Error("FILE_SLOT_INDEX_INVALID");
  const matches = (edge: CanonicalEdge) => edge.targetNodeId === target.id
    && (single && field ? field.ports.includes(edge.targetPortId) : edge.targetPortId === destination.portId);
  const resolver = new SpaceInputResolver(document, runtime);
  const sourceIds = (edge: CanonicalEdge) => {
    const ids = resolver.sourceAssetIds(edge.sourceNodeId, edge.sourcePortId);
    return mediaPort.valueShape === "ordered-list" ? ids : ids.slice(0, 1);
  };
  const incoming = document.edges.filter(matches);
  const occupied = (edge: CanonicalEdge) => port.slot !== undefined && port.slot >= edge.sortOrder
    && port.slot < edge.sortOrder + Math.max(1, sourceIds(edge).length);
  const removed = new Set(incoming.filter(edge => single || occupied(edge)));
  let edges = document.edges.filter(edge => !removed.has(edge));
  const nodes = [...document.nodes];
  // Never recycle IDs, even from a connection explicitly removed by this edit.
  const usedIds = new Set([...document.nodes, ...document.edges, ...document.groups].map(item => item.id));
  const freshId = () => {
    const id = createId();
    if (!validId(id)) throw new Error("MEDIA_ID_INVALID");
    if (usedIds.has(id)) throw new Error("MEDIA_ID_COLLISION");
    usedIds.add(id);
    return id;
  };

  // A collection occupies more than its starting slot. Freeze its other values
  // only on an explicit edit, preserving every neighbor and the original source.
  if (!single && port.slot !== undefined) for (const edge of removed) {
    sourceIds(edge).forEach((assetId, offset) => {
      const sortOrder = edge.sortOrder + offset;
      if (sortOrder === port.slot) return;
      const node = inputNode(freshId(), asset.type, assetId, { x: target.position.x - 560, y: target.position.y + sortOrder * 120 });
      nodes.push(node);
      edges.push({ ...edge, id: freshId(), sourceNodeId: node.id, sourcePortId: asset.type, sortOrder });
    });
  }
  const node = inputNode(freshId(), asset.type, asset.id, position);
  nodes.push(node);
  if (nodes.length > 500 || edges.length + 1 > 2000 || document.groups.length > 500) throw new Error("SPACE_GRAPH_LIMIT");

  const nullable = Boolean(field && fileFieldAllowsNullItems(field.field));
  const config = record(target.config), parameters = record(config.parameters), dynamic = record(parameters.dynamicParams);
  const marker = field && Object.hasOwn(dynamic, field.field.name) ? dynamic[field.field.name] : undefined;
  const markerLength = nullable && Array.isArray(marker) ? marker.length : 0;
  // Collections and explicit trailing nulls occupy slots even without an edge at
  // the last index. Append after their extent rather than overwriting a neighbor.
  const end = Math.max(markerLength, ...incoming.map(edge => edge.sortOrder + Math.max(1, sourceIds(edge).length)), 0);
  const order = port.slot ?? (single || !mediaPort.ordered ? 0 : end);
  const targetReference = { ...destination, slot: order };
  const draft = { ...document, nodes, edges };
  const connection = spaceConnectionForPorts(draft, { nodeId: node.id, direction: "output", portId: asset.type }, targetReference, catalog, freshId(), runtime);
  if (!connection.valid) throw new Error(connection.reason);
  edges = [...edges, connection.edge];
  if (nullable && field) {
    const length = Math.max(markerLength, connection.edge.sortOrder + 1);
    if (!Array.isArray(marker) || marker.length !== length || marker.some(value => value !== null)) {
      const index = nodes.indexOf(target);
      nodes[index] = { ...target, config: { ...config, parameters: { ...parameters, dynamicParams: {
        ...dynamic, [field.field.name]: Array.from({ length }, () => null),
      } } } };
    }
  }
  const next = { ...document, nodes, edges };
  if (slots.length) {
    const nextResolver = new SpaceInputResolver(next, runtime);
    assertPairedInputValues(slots.map(slot => slot.field), Object.fromEntries(slots.map(slot => [slot.field.name, spaceAttachmentAssetIds(nextResolver, target.id, slot)])));
  }
  return next;
}
