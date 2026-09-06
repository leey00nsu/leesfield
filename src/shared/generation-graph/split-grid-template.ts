import { z } from "zod";
import { findPortDefinition, validateNodeConfig } from "./node-registry";

export const splitTemplateKinds = ["input.image", "input.prompt", "generate.image", "edit.image.annotation", "edit.image.removeBackground", "edit.image.resize", "output.single", "output.gallery"] as const;
const id = z.string().min(1).max(80);
export const splitTemplateSchema = z.object({
  baseNodeId: id,
  nodes: z.array(z.object({
    id, kind: z.enum(splitTemplateKinds), configVersion: z.literal(1), config: z.json(),
    position: z.object({ x: z.number().min(-1e6).max(1e6), y: z.number().min(-1e6).max(1e6) }).strict(),
    size: z.object({ width: z.number().min(80).max(4096), height: z.number().min(80).max(4096) }).strict().optional(),
  }).strict()).min(1).max(100),
  edges: z.array(z.object({ id, sourceNodeId: id, targetNodeId: id, sourcePortId: id, targetPortId: id, sortOrder: z.number().int().min(0).max(100) }).strict()).max(300),
}).strict().superRefine((template, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (JSON.stringify(template).length > 500_000) fail("Template is too large.");
  const nodes = new Map(template.nodes.map((node) => [node.id, node]));
  if (nodes.size !== template.nodes.length || new Set(template.edges.map((edge) => edge.id)).size !== template.edges.length) fail("Duplicate template IDs.");
  if (nodes.get(template.baseNodeId)?.kind !== "input.image") fail("A fixed Cell Image is required.");
  for (const node of template.nodes) {
    if (node.kind === "input.image" && node.id !== template.baseNodeId) fail("Only the fixed Cell Image is allowed.");
    if (!validateNodeConfig(node.kind, 1, node.config).supported) fail(`Invalid config for ${node.kind}.`);
    const config = node.config as Record<string, unknown>;
    if (config && (config.templateSource || config.splitSource || (node.kind === "input.image" && config.assetId !== null))) fail("Templates cannot contain asset or materialization ownership.");
  }
  const incoming = new Map<string, number>();
  for (const edge of template.edges) {
    const source = nodes.get(edge.sourceNodeId), target = nodes.get(edge.targetNodeId);
    const output = source && findPortDefinition(source.kind, edge.sourcePortId, "output");
    const input = target && findPortDefinition(target.kind, edge.targetPortId, "input");
    if (!output || !input || output.valueType !== input.valueType || edge.targetNodeId === template.baseNodeId) fail("Invalid template connection.");
    const key = `${edge.targetNodeId}:${edge.targetPortId}`, count = (incoming.get(key) ?? 0) + 1;
    incoming.set(key, count);
    if (input?.maxConnections !== null && input?.maxConnections !== undefined && count > input.maxConnections) fail("Too many input connections.");
  }
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return false;
    if (done.has(nodeId)) return true;
    visiting.add(nodeId);
    for (const edge of template.edges) if (edge.sourceNodeId === nodeId && !visit(edge.targetNodeId)) return false;
    visiting.delete(nodeId); done.add(nodeId); return true;
  };
  if (template.nodes.some((node) => !visit(node.id))) fail("Template contains a cycle.");
});
export type CanonicalSplitTemplate = z.infer<typeof splitTemplateSchema>;
