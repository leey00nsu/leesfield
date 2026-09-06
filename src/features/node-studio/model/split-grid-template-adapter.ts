import { splitTemplateSchema, type CanonicalSplitTemplate } from "@/shared/generation-graph/split-grid-template";
import { defaultConfigForKind } from "../runtime/node-banana/node-banana-runtime-adapter";

export type HostedSplitTemplate = {
  baseNodeId: string;
  nodes: { id: string; type: string; position: { x: number; y: number }; size?: { width: number; height: number }; data?: Record<string, unknown> }[];
  edges: { id: string; source: string; target: string; sourceHandle: string; targetHandle: string }[];
  router?: { source: string; sourceHandle: string; targetHandle: string }[];
};
const kinds = { imageInput: "input.image", prompt: "input.prompt", nanoBanana: "generate.image", annotation: "edit.image.annotation", removeBackground: "edit.image.removeBackground", imageResize: "edit.image.resize", output: "output.single", outputGallery: "output.gallery" } as const;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function canonicalSplitTemplate(value: HostedSplitTemplate): CanonicalSplitTemplate {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.router?.length) throw new Error("Unsupported cell template.");
  const nodes = value.nodes.map((node) => {
    const kind = Object.hasOwn(kinds, node.type) ? kinds[node.type as keyof typeof kinds] : null;
    if (!kind) throw new Error("Unsupported cell template node.");
    const data = object(node.data), config = { ...object(defaultConfigForKind(kind)), ...object(data.canonicalConfig) };
    if (kind === "input.prompt") config.text = data.prompt ?? config.text;
    if (kind === "generate.image") {
      config.modelKey = object(data.selectedModel).modelId ?? null;
      config.parameters = data.parameters ?? {};
    }
    return { id: node.id, kind, configVersion: 1 as const, config, position: node.position, ...(node.size ? { size: node.size } : {}) };
  });
  const count = new Map<string, number>();
  const edges = value.edges.map((edge) => {
    const target = nodes.find((node) => node.id === edge.target);
    let targetPortId = edge.targetHandle;
    if (target?.kind === "generate.image") targetPortId = edge.targetHandle === "text" ? "prompt" : "primary";
    const key = `${edge.target}:${targetPortId}`, sortOrder = count.get(key) ?? 0;
    count.set(key, sortOrder + 1);
    return { id: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target, sourcePortId: edge.sourceHandle, targetPortId, sortOrder };
  });
  return splitTemplateSchema.parse({ baseNodeId: value.baseNodeId, nodes, edges });
}

export function hostedSplitTemplate(value: CanonicalSplitTemplate): HostedSplitTemplate {
  const template = splitTemplateSchema.parse(value);
  return { baseNodeId: template.baseNodeId,
    nodes: template.nodes.map((node) => {
      const config = object(node.config);
      return { id: node.id, type: Object.entries(kinds).find(([, kind]) => node.kind === kind)![0], position: node.position, size: node.size,
        data: { canonicalConfig: config, ...(node.kind === "input.prompt" ? { prompt: config.text } : {}),
          ...(node.kind === "generate.image" ? { selectedModel: typeof config.modelKey === "string" ? { provider: "hf_space", modelId: config.modelKey, displayName: config.modelKey } : null, parameters: config.parameters } : {}) } };
    }),
    edges: template.edges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: edge.sourcePortId,
      targetHandle: edge.targetPortId === "primary" ? "image" : edge.targetPortId === "prompt" ? "text" : edge.targetPortId })),
  };
}
