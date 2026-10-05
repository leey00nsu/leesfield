import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";
import { getGradioContract, fileFieldMaxItems, type GradioField } from "@/shared/model-catalog/gradio-contract";
import { fileInputPort } from "@/shared/model-catalog/file-input-ports";
import { resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage,
  type RuntimeImageModel, type RuntimeVideoModel, type RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { createCanonicalRuntimeNode } from "../runtime/node-banana/node-banana-runtime-adapter";
import { resolveNodeInputAssetIds } from "./node-graph-inputs";

export type GenerationAttachmentSlot = { field: GradioField; ports: string[]; limit: number };
export function generationAttachmentSlots(model: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel): GenerationAttachmentSlot[] {
  const contract = getGradioContract(model);
  if (contract) return contract.inputs.filter(field => !field.hidden && ["file", "files", "gallery"].includes(field.kind) && field.media)
    .map(field => ({ field, ports: [fileInputPort(field.media!, field.name)], limit: fileFieldMaxItems(field) }));
  const limit = model.type === "image" ? resolveRuntimeImageMaxInputImages(model)
    : model.type === "video" && resolveRuntimeVideoSupportsInitImage(model) ? 1 : 0;
  return limit ? [{ field: { name: "reference", label: "Reference", kind: limit > 1 ? "files" : "file",
    media: "image", required: false, nullable: false, schema: { maxItems: limit } },
    ports: model.type === "image" ? ["primary", "references"] : ["initImage"], limit }] : [];
}

/** Atomically replace these input edges; keep source nodes, assets and unrelated edges. */
export function replaceGenerationAttachments(graph: NodeBananaRuntimeGraph, nodeId: string, slot: GenerationAttachmentSlot,
  assetIds: readonly string[], createId: () => string): NodeBananaRuntimeGraph {
  const target = graph.nodes.find(node => node.id === nodeId);
  const previousIds = slot.ports.flatMap(port => resolveNodeInputAssetIds(graph, nodeId, port));
  const removing = assetIds.length < previousIds.length && assetIds.every(id => previousIds.includes(id));
  if (!target || !slot.field.media || (assetIds.length > slot.limit && !removing)) throw new Error("ATTACHMENT_LIMIT");
  const media = slot.field.media;
  const matches = (edge: NodeBananaRuntimeGraph["edges"][number]) =>
    edge.target === nodeId && slot.ports.includes(String(edge.data?.targetPortId ?? edge.targetHandle));
  const inputEdges = graph.edges.filter(matches).sort((a,b) => Number(a.data?.sortOrder ?? 0) - Number(b.data?.sortOrder ?? 0));
  const unused = [...inputEdges], nodes = [...graph.nodes], edges = graph.edges.filter(edge => !matches(edge));
  assetIds.forEach((assetId, index) => {
    const found = unused.findIndex(edge => resolveNodeInputAssetIds({ ...graph, edges: [edge, ...graph.edges.filter(item => item.target !== nodeId)] },
      nodeId, String(edge.data?.targetPortId ?? edge.targetHandle))[0] === assetId);
    const port = slot.ports.length === 2 ? (index === 0 ? slot.ports[0] : slot.ports[1]) : slot.ports[0];
    const handle = ["primary", "references", "initImage"].includes(port) ? "image" : port;
    if (found >= 0) {
      const [edge] = unused.splice(found, 1);
      edges.push({ ...edge, targetHandle: handle, data: { ...edge.data, targetPortId: port, sortOrder: index } });
    } else {
      const source = createCanonicalRuntimeNode(`input.${media}`, createId(),
        { x: target.position.x - 560, y: target.position.y + index * 120 });
      source.data = { ...source.data, config: { assetId } };
      nodes.push(source);
      edges.push({ id: createId(), source: source.id, target: nodeId, sourceHandle: slot.field.media, targetHandle: handle,
        data: { sourcePortId: slot.field.media, targetPortId: port, sortOrder: index } });
    }
  });
  return { ...graph, nodes, edges };
}
