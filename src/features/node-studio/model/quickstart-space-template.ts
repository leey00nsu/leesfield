import type { HostedPresetWorkflow } from "@node-banana-runtime/runtime-entry";
import type { GenerationGraphEdgeDto, GenerationGraphNodeDto } from "./graph-types";

/** Only original preset topology and optional prompt examples cross this boundary. */
export function quickstartSpaceTemplate(workflow: HostedPresetWorkflow, createId = () => crypto.randomUUID()) {
  const ids = new Map(workflow.nodes.map((node) => [node.id, createId()]));
  if (ids.size !== workflow.nodes.length || ids.size > 500) throw new Error("Invalid template node IDs.");
  const kinds: Record<string, string> = { imageInput: "input.image", prompt: "input.prompt", nanoBanana: "generate.image", output: "output.single" };
  const nodes: GenerationGraphNodeDto[] = workflow.nodes.map((node): GenerationGraphNodeDto => {
    const kind = kinds[node.type];
    if (!kind || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error("Unsupported template node.");
    return { id: ids.get(node.id)!, kind, position: { ...node.position }, configVersion: 1, selectedOutputAssetId: null,
      config: kind === "input.image" ? { assetId: null } : kind === "input.prompt" ? { text: String(node.data.prompt ?? "").slice(0, 20_000) }
        : kind === "generate.image" ? { prompt: "", modelKey: null, parameters: {} } : { mediaType: null, excludedAssetIds: [] } };
  });
  const imageCount = new Map<string, number>();
  const edges: GenerationGraphEdgeDto[] = workflow.edges.map((edge) => {
    const source = workflow.nodes.find((node) => node.id === edge.source), target = workflow.nodes.find((node) => node.id === edge.target);
    if (!source || !target) throw new Error("Invalid template connection.");
    const text = source.type === "prompt";
    let targetPortId = text ? "prompt" : "image", sortOrder = 0;
    if (target.type === "nanoBanana" && !text) {
      const index = imageCount.get(target.id) ?? 0; imageCount.set(target.id, index + 1);
      targetPortId = index === 0 ? "primary" : "references"; sortOrder = Math.max(0, index - 1);
    }
    return { id: createId(), sourceNodeId: ids.get(edge.source)!, targetNodeId: ids.get(edge.target)!,
      sourcePortId: text ? "text" : "image", targetPortId, sortOrder, hasPause: false };
  });
  return { nodes, edges, groups: [] };
}
