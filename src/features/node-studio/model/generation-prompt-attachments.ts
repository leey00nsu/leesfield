import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";
import { getGradioContract, fileFieldMaxItems, type GradioField } from "@/shared/model-catalog/gradio-contract";
import { fileFieldInputPorts } from "@/shared/model-catalog/file-input-ports";
import { resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage,
  type RuntimeImageModel, type RuntimeVideoModel, type RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { createCanonicalRuntimeNode } from "../runtime/node-banana/node-banana-runtime-adapter";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { resolveNodeInputAssetSlots, resolveNodeInputAssetIds } from "./node-graph-inputs";
import { pairedAudioField, reorderPairedSlots, assertPairedInputValues } from "@/shared/model-catalog/attachment-relationships";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";

export type GenerationAttachmentSlot = { field: GradioField; ports: string[]; limit: number };
export function attachmentSlotAssetIds(graph: NodeBananaRuntimeGraph, nodeId: string, slot: GenerationAttachmentSlot) {
  return slot.ports.flatMap(port=>fileFieldAllowsNullItems(slot.field)?resolveNodeInputAssetSlots(graph,nodeId,port):resolveNodeInputAssetIds(graph,nodeId,port));
}

/** One graph update owns both input arrays. Order is explicit, so duplicate assets cannot mispair. */
export function replaceRelatedGenerationAttachments(graph: NodeBananaRuntimeGraph, nodeId: string, slots: readonly GenerationAttachmentSlot[],
  slot: GenerationAttachmentSlot, ids: readonly (string|null)[], createId:()=>string, order?:readonly number[]) {
  const pairedField = pairedAudioField(slots.map(item=>item.field), slot.field.name);
  const paired = slots.find(item=>item.field.name===pairedField?.name);
  let next = replaceGenerationAttachments(graph,nodeId,slot,ids,createId);
  if (paired && order) {
    const previous=attachmentSlotAssetIds(graph,nodeId,slot);
    if (new Set(order).size!==order.length || order.length!==ids.length || order.some((index,position)=>!Number.isInteger(index)||index<0||index>=previous.length||previous[index]!==ids[position]))
      throw new Error("ATTACHMENT_ORDER");
    next=replaceGenerationAttachments(next,nodeId,paired,reorderPairedSlots(attachmentSlotAssetIds(graph,nodeId,paired),order),createId);
  }
  assertPairedInputValues(slots.map(item=>item.field),Object.fromEntries(slots.map(item=>[item.field.name,attachmentSlotAssetIds(next,nodeId,item)])));
  return next;
}
export function generationAttachmentSlots(model: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel): GenerationAttachmentSlot[] {
  const contract = getGradioContract(model);
  if (contract) return contract.inputs.filter(field => !field.hidden && ["file", "files", "gallery"].includes(field.kind) && field.media)
    .map(field => ({ field, ports: fileFieldInputPorts(contract, field), limit: fileFieldMaxItems(field) }));
  const limit = model.type === "image" ? resolveRuntimeImageMaxInputImages(model)
    : model.type === "video" && resolveRuntimeVideoSupportsInitImage(model) ? 1 : 0;
  return limit ? [{ field: { name: "reference", label: "Reference", kind: limit > 1 ? "files" : "file",
    media: "image", required: false, nullable: false, schema: { maxItems: limit } },
    ports: model.type === "image" ? ["primary", "references"] : ["initImage"], limit }] : [];
}

/** Atomically replace these input edges; keep source nodes, assets and unrelated edges. */
export function replaceGenerationAttachments(graph: NodeBananaRuntimeGraph, nodeId: string, slot: GenerationAttachmentSlot,
  assetIds: readonly (string|null)[], createId: () => string): NodeBananaRuntimeGraph {
  const target = graph.nodes.find(node => node.id === nodeId);
  const positional=fileFieldAllowsNullItems(slot.field);
  const previousIds = slot.ports.flatMap(port => positional?resolveNodeInputAssetSlots(graph,nodeId,port):resolveNodeInputAssetIds(graph, nodeId, port));
  const removing = assetIds.length < previousIds.length && assetIds.every(id => previousIds.includes(id));
  if (!target || !slot.field.media || (assetIds.length > slot.limit && !removing)) throw new Error("ATTACHMENT_LIMIT");
  const media = slot.field.media;
  const matches = (edge: NodeBananaRuntimeGraph["edges"][number]) =>
    edge.target === nodeId && slot.ports.includes(String(edge.data?.targetPortId ?? edge.targetHandle));
  const inputEdges = graph.edges.filter(matches).sort((a,b) => Number(a.data?.sortOrder ?? 0) - Number(b.data?.sortOrder ?? 0));
  const unused = [...inputEdges], nodes = [...graph.nodes], edges = graph.edges.filter(edge => !matches(edge));
  assetIds.forEach((assetId, index) => {
    if(assetId===null){if(!positional)throw new Error("ATTACHMENT_MEDIA");return;}
    const found = unused.findIndex(edge => resolveNodeInputAssetIds({ ...graph, edges: [edge, ...graph.edges.filter(item => item.target !== nodeId)] },
      nodeId, String(edge.data?.targetPortId ?? edge.targetHandle))[0] === assetId);
    const port = slot.ports.length === 2 && slot.ports[0] === "primary" ? (index === 0 ? slot.ports[0] : slot.ports[1]) : slot.ports[0];
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
  if (positional) {
    // File-free null markers retain explicit trailing empty slots across graph persistence.
    const index=nodes.findIndex(node=>node.id===nodeId), config=nodes[index].data.config;
    const current=config && typeof config==="object" && !Array.isArray(config) ? config as Record<string,CanonicalJsonValue> : {};
    const parameters=current.parameters && typeof current.parameters==="object" && !Array.isArray(current.parameters) ? current.parameters : {};
    const dynamic=parameters.dynamicParams && typeof parameters.dynamicParams==="object" && !Array.isArray(parameters.dynamicParams) ? parameters.dynamicParams : {};
    nodes[index]={...nodes[index],data:{...nodes[index].data,config:{...current,parameters:{...parameters,dynamicParams:{...dynamic,[slot.field.name]:assetIds.map(()=>null)}}}}};
  }
  return { ...graph, nodes, edges };
}
