import { describe, expect, it } from "vitest";

import { createCanonicalRuntimeNode } from "../runtime/node-banana/node-banana-runtime-adapter";
import { remapSplitClipboardNodes } from "./split-grid-clipboard";
import { materializeSplitResult, splitMaterialization } from "./split-grid-materialization";

function fixture() {
  let id = 0;
  return materializeSplitResult({
    nodes: [createCanonicalRuntimeNode("edit.image.splitGrid", "split", { x: 20, y: 30 })], edges: [],
  }, "split", ["slice-1", "slice-2", "slice-3", "slice-4"], { rows: 2, cols: 2 }, () => `original-${++id}`);
}

describe("Split clipboard ownership", () => {
  it("clears materialization when copying Split alone, even with unrelated map entries", () => {
    const graph = fixture();
    const idMap = Object.fromEntries(graph.nodes.map((node) => [node.id, `copy-${node.id}`]));
    const [copy] = remapSplitClipboardNodes([graph.nodes[0]], idMap);
    expect(splitMaterialization(copy.data.config)).toBeUndefined();
    expect(splitMaterialization(graph.nodes[0].data.config)?.cells).toHaveLength(4);
    expect(copy.id).toBe("split");
    expect(copy.position).toEqual(graph.nodes[0].position);
  });

  it("remaps whole copied grids, shifts fresh groups, and reruns without touching originals", () => {
    const graph = fixture();
    const snapshot = structuredClone(graph);
    const idMap = Object.fromEntries(graph.nodes.map((node) => [node.id, `copy-${node.id}`]));
    const offset = { x: 80, y: 100 };
    const groupMap = Object.fromEntries((graph.groups ?? []).map((group) => [group.id, `copy-${group.id}`]));
    const copies = remapSplitClipboardNodes(graph.nodes, idMap, offset, groupMap);
    const original = splitMaterialization(graph.nodes[0].data.config)!;
    const copied = splitMaterialization(copies[0].data.config)!;
    expect(copied.cells.map((cell) => cell.baseNodeId)).toEqual(original.cells.map((cell) => idMap[cell.baseNodeId]));
    expect(copied.cells.map((cell) => cell.nodeIds)).toEqual(original.cells.map((cell) => cell.nodeIds.map((id) => idMap[id])));
    expect(new Set(copied.cells.map((cell) => cell.groupId)).size).toBe(4);
    copied.cells.forEach((cell, index) => {
      expect(cell.groupId).toBe(groupMap[original.cells[index].groupId!]);
      expect(cell).not.toHaveProperty("group");
    });
    expect(copies[1].data.config).toMatchObject({ assetId: "slice-1", splitSource: { nodeId: "copy-split", index: 0 } });
    const pasted = copies.map((node) => ({ ...node, id: idMap[node.id], position: { x: node.position.x + offset.x, y: node.position.y + offset.y } }));
    const rerun = materializeSplitResult({ ...graph, nodes: [...graph.nodes, ...pasted] }, "copy-split",
      ["new-1", "new-2", "new-3", "new-4"], { rows: 2, cols: 2 });
    expect(rerun.nodes.slice(0, graph.nodes.length)).toEqual(snapshot.nodes);
    expect(rerun.nodes.find((node) => node.id === idMap[graph.nodes[1].id])?.data.config).toMatchObject({ assetId: "new-1" });
    expect(graph).toEqual(snapshot);
  });

  it("prunes uncopied cells from partial grids and never retains original node IDs", () => {
    const graph = fixture();
    const nodes = [graph.nodes[0], graph.nodes[2]];
    const idMap = Object.fromEntries(nodes.map((node) => [node.id, `partial-${node.id}`]));
    const copies = remapSplitClipboardNodes(nodes, idMap);
    expect(splitMaterialization(copies[0].data.config)?.cells).toEqual([
      expect.objectContaining({ baseNodeId: idMap[nodes[1].id], nodeIds: [idMap[nodes[1].id]] }),
    ]);
    expect(copies[1].data.config).toMatchObject({ assetId: "slice-2", splitSource: { nodeId: "partial-split", index: 1 } });
  });

  it("detaches a cell copied alone while preserving its asset and filename", () => {
    const graph = fixture();
    const cell = graph.nodes[1];
    const [copy] = remapSplitClipboardNodes([cell], { [cell.id]: "copied-cell", split: "not-actually-copied" });
    expect(copy.data.config).not.toHaveProperty("splitSource");
    expect(copy.data.config).toMatchObject({ assetId: "slice-1", filename: "leesfield-split-1-1.png" });
    expect(cell.data.config).toHaveProperty("splitSource");
  });
});
