import { describe, expect, it } from "vitest";
import { applySplitTemplate, materializeSplitResult, splitCellGroups, splitMaterialization } from "./split-grid-materialization";
import { canonicalSplitTemplate, hostedSplitTemplate } from "./split-grid-template-adapter";
import { copySpaceConfig } from "@/server/generation-graph/copy-space-config";
import { createCanonicalRuntimeNode, runtimeGraphToCanonicalDocument, canonicalDocumentToRuntimeGraph } from "../runtime/node-banana/node-banana-runtime-adapter";
import { validateCanonicalGraph, type GraphDocumentV3 } from "@/shared/generation-graph/canonical-graph";

const assets = ["asset_1", "asset_2", "asset_3", "asset_4"];
function fixture() {
  let sequence = 0;
  const createId = () => "cell_" + ++sequence;
  const graph = { nodes: [createCanonicalRuntimeNode("edit.image.splitGrid", "split", { x: 20, y: 30 })], edges: [] };
  return { graph, createId };
}
function split() {
  const { graph, createId } = fixture();
  return materializeSplitResult(graph, "split", assets, { rows: 2, cols: 2 }, createId);
}
describe("cell template application", () => {
  const template = () => canonicalSplitTemplate({ baseNodeId: "base", nodes: [
    { id: "base", type: "imageInput", position: { x: 0, y: 0 } },
    { id: "prompt", type: "prompt", position: { x: 0, y: 300 }, data: { prompt: "portrait" } },
    { id: "gen", type: "nanoBanana", position: { x: 400, y: 0 } },
  ], edges: [
    { id: "image", source: "base", target: "gen", sourceHandle: "image", targetHandle: "image" },
    { id: "text", source: "prompt", target: "gen", sourceHandle: "text", targetHandle: "text" },
  ] });
  it("materializes each topology once, round-trips canonical config, and fills cells on Split without rebuilding edits", () => {
    const { graph, createId } = fixture(), before = structuredClone(graph), input = template();
    const next = applySplitTemplate(graph, "split", input, false, [], createId);
    expect(graph).toEqual(before);
    expect(next.nodes).toHaveLength(13); expect(next.edges).toHaveLength(12); expect(next.groups).toHaveLength(4);
    expect(canonicalSplitTemplate(hostedSplitTemplate(input))).toEqual(input);
    const document = runtimeGraphToCanonicalDocument({ schemaVersion: 3, minimumWriterVersion: 3, id: "space", version: 1, title: "test", nodes: [], edges: [], groups: [] }, next);
    expect(validateCanonicalGraph(document)).toEqual([]);
    expect(canonicalDocumentToRuntimeGraph(document).nodes).toHaveLength(13);
    const rerun = materializeSplitResult(next, "split", assets, { rows: 2, cols: 2 }, createId);
    expect(rerun.nodes.map((node) => node.id)).toEqual(next.nodes.map((node) => node.id));
    expect(rerun.edges).toEqual(next.edges);
    expect(rerun.nodes.filter((node) => node.data.canonicalKind === "input.image").map((node) => (node.data.config as { assetId: string }).assetId)).toEqual(assets);
    const generated = document.nodes.find((node) => node.kind === "generate.image")!;
    expect(copySpaceConfig(generated, new Map([["split", "copy"]]), createId)).toMatchObject({ templateSource: { nodeId: "copy" } });
  });
  it("requires confirmation before replacing edited cells/external connections and preserves unrelated nodes", () => {
    const { graph, createId } = fixture(), input = template();
    const next = applySplitTemplate(graph, "split", input, false, [], createId);
    next.nodes.push(createCanonicalRuntimeNode("output.single", "outside", { x: 0, y: 0 }));
    next.edges.push({ id: "external", source: next.nodes[3].id, target: "outside", sourceHandle: "image", targetHandle: "image" });
    const before = structuredClone(next);
    expect(() => applySplitTemplate(next, "split", input, false, [], createId)).toThrow("12 existing cell nodes and 1 external connections");
    expect(next).toEqual(before);
    const replaced = applySplitTemplate(next, "split", input, true, [], createId);
    expect(replaced.nodes.some((node) => node.id === "outside")).toBe(true);
    expect(replaced.nodes).toHaveLength(14);
    expect(replaced.edges.some((edge) => edge.id === "external")).toBe(false);
  });
  it("rejects invalid templates and cell multiplication before mutation", () => {
    const { graph } = fixture(), input = template(), before = structuredClone(graph);
    expect(() => applySplitTemplate(graph, "split", { ...input, nodes: [...input.nodes, input.nodes[0]] })).toThrow();
    expect(() => applySplitTemplate(graph, "split", { ...input, edges: [...input.edges, { id: "cycle", sourceNodeId: "gen", targetNodeId: "base", sourcePortId: "image", targetPortId: "reference", sortOrder: 0 }] })).toThrow();
    const many = structuredClone(graph); many.nodes[0].data.config = { parameters: { rows: 20, cols: 20 } };
    expect(() => applySplitTemplate(many, "split", input)).toThrow("NODE_LIMIT");
    expect(graph).toEqual(before);
  });
});
describe("upstream Split cell materialization", () => {
  it("creates row-major cell inputs, original groups and visual reference edges", () => {
    const graph = split();
    expect(graph.nodes).toHaveLength(5);
    expect(graph.nodes.slice(1).map((node) => (node.data.config as { assetId: string }).assetId)).toEqual(assets);
    expect(graph.edges).toHaveLength(4);
    expect(graph.edges.every((edge) => edge.type === "reference" && edge.sourceHandle === "reference" && edge.targetHandle === "reference")).toBe(true);
    expect(Object.keys(splitCellGroups(graph))).toHaveLength(4);
    expect(graph.nodes[2].position.x).toBeGreaterThan(graph.nodes[1].position.x);
    expect(graph.nodes[3].position.y).toBeGreaterThan(graph.nodes[1].position.y);
  });
  it("preserves IDs, positions, downstream wiring and intentional partial pruning on rerun", () => {
    const graph = split();
    graph.nodes[1].position = { x: 900, y: 700 };
    const output = createCanonicalRuntimeNode("output.single", "out", { x: 1900, y: 0 });
    graph.nodes.push(output);
    graph.edges.push({ id: "downstream", source: graph.nodes[1].id, target: "out", sourceHandle: "image", targetHandle: "image" });
    const removedId = graph.nodes[2].id;
    graph.nodes = graph.nodes.filter((node) => node.id !== removedId);
    graph.edges = graph.edges.filter((edge) => edge.target !== removedId);
    const next = materializeSplitResult(graph, "split", assets.map((id) => id + "_new"), { rows: 2, cols: 2 });
    expect(next.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(next.nodes[1].position).toEqual({ x: 900, y: 700 });
    expect(next.edges).toEqual(graph.edges);
    expect((next.nodes[1].data.config as { assetId: string }).assetId).toBe("asset_1_new");
  });
  it("rejects a changed grid while execution was in flight", () => {
    const { graph, createId } = fixture();
    expect(() => materializeSplitResult(graph, "split", ["one"], { rows: 1, cols: 1 }, createId)).toThrow("CONFIGURATION_CHANGED");
  });
  it("round-trips neutral cell metadata and reference edge presentation", () => {
    const graph = split();
    const base: GraphDocumentV3 = { schemaVersion: 3, groups: [], minimumWriterVersion: 3, id: "graph", version: 1, title: "Split", nodes: [], edges: [] };
    const document = runtimeGraphToCanonicalDocument(base, graph);
    expect(validateCanonicalGraph(document)).toEqual([]);
    const restored = canonicalDocumentToRuntimeGraph(document);
    expect(splitMaterialization(restored.nodes[0].data.config)).toEqual(splitMaterialization(graph.nodes[0].data.config));
    expect(restored.edges.every((edge) => edge.type === "reference")).toBe(true);
    expect(Object.keys(splitCellGroups(restored))).toHaveLength(4);
  });

  it("rebuilds a resized grid without deleting unrelated nodes or their wiring", () => {
    const graph = split();
    const config = graph.nodes[0].data.config as Record<string, unknown>;
    graph.nodes[0].data.config = { ...config, parameters: { rows: 1, cols: 2 } };
    const input = createCanonicalRuntimeNode("input.image", "unrelated", { x: 0, y: 900 });
    graph.nodes.push(input);
    const next = materializeSplitResult(graph, "split", ["new_0", "new_1"], { rows: 1, cols: 2 });
    expect(next.nodes.some((node) => node.id === "unrelated")).toBe(true);
    expect(next.nodes).toHaveLength(4);
    expect(next.edges).toHaveLength(2);
    expect(next.nodes.filter((node) => node.id.startsWith("cell_"))).toHaveLength(0);
  });

  it("keeps an intentionally removed group removed across reruns", () => {
    const graph = split();
    const cell = splitMaterialization(graph.nodes[0].data.config)!.cells[0];
    graph.groups = graph.groups?.filter((group) => group.id !== cell.groupId);
    cell.groupId = null;
    const next = materializeSplitResult(graph, "split", assets, { rows: 2, cols: 2 });
    expect(Object.keys(splitCellGroups(next))).toHaveLength(3);
  });

  it("does not publish results into a graph where the source was deleted", () => {
    const graph = { nodes: [], edges: [] };
    expect(materializeSplitResult(graph, "gone", assets, { rows: 2, cols: 2 })).toBe(graph);
  });
});
