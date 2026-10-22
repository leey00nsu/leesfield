import { describe, expect, it } from "vitest";

import { temporarilyHiddenEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { analyzeCanonicalGraphSupport } from "@/shared/generation-graph/canonical-graph";

import { applySpaceEditorCommand, prepareSpaceEditorTransaction, validateSpaceEditorDocument } from "./space-editor-commands";
import type { SpaceEditorCommand, SpaceEditorSuccess } from "./space-editor-command-types";
import type { SpaceEditorDocument } from "./space-editor-types";

const image = (id: string): SpaceEditorDocument["nodes"][number] => ({ id, kind: "input.image", position: { x: 0, y: 0 }, configVersion: 1, config: { assetId: null }, selectedOutputAssetId: null });
const base = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Space", nodes: [image("a"), image("b"), image("relay")], edges: [], groups: [] });
function apply(document: SpaceEditorDocument, command: SpaceEditorCommand): SpaceEditorSuccess {
  const result = applySpaceEditorCommand(document, command);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("canonical commands", () => {
  it.each(temporarilyHiddenEditNodeKinds)("retains %s data and selection while blocking creation, edits, duplication and incident connections", kind => {
    const mediaType = kind === "edit.image.resize" ? "image" : "video";
    const inputPort = kind === "edit.video.stitch" ? "clips" : mediaType;
    const saved = { ...image("hidden"), kind, config: { parameters: {} }, selectedOutputAssetId: "retained-result" };
    const document: SpaceEditorDocument = { ...base(), nodes: [{ ...image("source"), kind: `input.${mediaType}` }, saved], edges: [
      { id: "saved-wire", sourceNodeId: "source", sourcePortId: mediaType, targetNodeId: "hidden", targetPortId: inputPort, sortOrder: 0, hasPause: false },
    ] };
    const original = structuredClone(document);
    const denied: SpaceEditorCommand[] = [
      { type: "node.add", node: { ...saved, id: "new" } },
      { type: "nodes.duplicate", nodeIds: ["hidden"] },
      { type: "node.config.patch", nodeId: "hidden", patch: { parameters: { changed: true } } },
      { type: "edge.connect", edge: { ...document.edges[0], id: "new-wire" } },
      { type: "edge.pause", edgeId: "saved-wire", hasPause: true },
    ];
    for (const command of denied) expect(applySpaceEditorCommand(document, command)).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    expect(apply(document, { type: "title.set", title: "Unrelated edit" }).document).toEqual({ ...original, title: "Unrelated edit" });
    const completed = prepareSpaceEditorTransaction(document, { ...document, nodes: document.nodes.map(node => node.id === "hidden" ? { ...node, selectedOutputAssetId: "late-result" } : node) }, { origin: "system" });
    expect(completed).toMatchObject({ ok: true, changed: true, document: { nodes: [expect.anything(), { ...saved, selectedOutputAssetId: "late-result" }] } });
    expect(apply(document, { type: "node.remove", nodeId: "hidden" }).document).toMatchObject({ nodes: [document.nodes[0]], edges: [] });
    expect(document).toStrictEqual(original);
  });

  it("scopes old Gallery exclusions only for explicit reconnects, with pure reads/system refreshes leaving saved data unchanged", () => {
    const sources = ["a", "b", "fresh"].map(id => ({ ...image(id), config: { assetId: "hidden" } }));
    const gallery = { ...image("gallery"), kind: "output.gallery", config: { mediaType: null, excludedAssetIds: ["hidden"] } };
    const first = { id: "first", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 0 };
    const second = { ...first, id: "second", sourceNodeId: "b", sortOrder: 1 };
    const document: SpaceEditorDocument = { ...base(), nodes: [...sources, gallery], edges: [first, second] };
    const moved = apply(document, { type: "node.move", nodeId: "gallery", position: { x: 100, y: 0 } }).document;
    expect(moved.nodes[3].config).toEqual(gallery.config);
    const refreshed = prepareSpaceEditorTransaction(document, structuredClone(document), { origin: "system" });
    expect(refreshed).toMatchObject({ ok: true, changed: false });
    const next = apply(document, { type: "edge.connect", edge: { ...first, id: "new-edge", sourceNodeId: "fresh", sortOrder: 2 } }).document;
    expect(next.nodes[3].config).toEqual({ ...gallery.config, legacyExcludedEdgeIds: ["first", "second"] });
    expect(next.nodes.slice(0, 3)).toEqual(sources);
    expect(document.nodes[3].config).toEqual(gallery.config);
    const replaced = apply(next, { type: "edge.replace", edgeId: "first", edge: first }).document;
    expect(replaced.nodes[3].config).toEqual({ ...gallery.config, legacyExcludedEdgeIds: ["second"] });
    const reconnected = apply(replaced, { type: "edge.connect", edge: { ...first, id: "another", sortOrder: 3 } }).document;
    expect(reconnected.nodes[3].config).toEqual(replaced.nodes[3].config);
  });
  it("authors registry defaults and changes only the affected entity", () => {
    const document = base();
    const next = apply(document, { type: "node.add", node: { id: "memo", kind: "note.memo", position: { x: 10, y: 20 } } }).document;
    expect(next.nodes[3]).toEqual({ id: "memo", kind: "note.memo", position: { x: 10, y: 20 }, configVersion: 1, config: { text: "" }, selectedOutputAssetId: null });
    expect(next.nodes[0]).toBe(document.nodes[0]);
    expect(next.edges).toBe(document.edges);
    expect(next.groups).toBe(document.groups);
    expect(document.nodes).toHaveLength(3);
  });

  it("preserves unparsed defaults and treats no-op values as no change", () => {
    const document = base();
    const result = apply(document, { type: "node.config.replace", nodeId: "relay", config: { assetId: null } });
    expect(result.changed).toBe(false);
    expect(result.document).toBe(document);
    expect(result.document.nodes[2].config).toEqual({ assetId: null });
    expect(apply(document, { type: "node.config.fields", nodeId: "relay", changes: [{ path: ["presentation", "comment"], remove: true }] }).document).toBe(document);
  });

  it("patches nested fields without losing false, zero, null, empty string, arrays or unrelated keys", () => {
    const document = { ...base(), nodes: [{ ...image("gen"), kind: "generate.image", config: { prompt: "before", modelKey: "model", parameters: { seed: 7, flag: true, nested: { keep: 2 } } } }] };
    const next = apply(document, { type: "node.config.patch", nodeId: "gen", patch: { prompt: "", modelKey: null, parameters: { seed: 0, flag: false, nullable: null, list: [], nested: { value: "" } } } }).document;
    expect(next.nodes[0].config).toEqual({ prompt: "", modelKey: null, parameters: { seed: 0, flag: false, nullable: null, list: [], nested: { keep: 2, value: "" } } });
    const removed = apply(next, { type: "node.config.fields", nodeId: "gen", changes: [{ path: ["parameters", "nested", "keep"], remove: true }] }).document;
    expect(removed.nodes[0].config).toMatchObject({ parameters: { nested: { value: "" } } });
  });

  it("supports own JSON keys without writing object prototypes", () => {
    const document = { ...base(), nodes: [{ ...image("gen"), kind: "generate.image", config: { prompt: "", modelKey: null, parameters: {} } }] };
    const result = apply(document, { type: "node.config.fields", nodeId: "gen", changes: [{ path: ["parameters", "__proto__"], value: { retained: true } }] });
    const config = result.document.nodes[0].config as { parameters: Record<string, unknown> };
    expect(Object.hasOwn(config.parameters, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(config.parameters)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).retained).toBeUndefined();
  });

  it("uses exact canonical ports, ordered slots and the three pause representations", () => {
    let document = base();
    document = { ...document, nodes: [...document.nodes, { ...image("gen"), kind: "generate.image", config: { prompt: "", modelKey: null, parameters: {} } }] };
    document = apply(document, { type: "edge.connect", edge: { id: "primary", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gen", targetPortId: "primary", hasPause: false } }).document;
    document = apply(document, { type: "edge.connect", edge: { id: "ref1", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gen", targetPortId: "references" } }).document;
    document = apply(document, { type: "edge.connect", edge: { id: "ref2", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "gen", targetPortId: "references", hasPause: true } }).document;
    expect(document.edges.map((edge) => [edge.targetPortId, edge.sortOrder, Object.hasOwn(edge, "hasPause"), edge.hasPause])).toEqual([
      ["primary", 0, true, false], ["references", 0, false, undefined], ["references", 1, true, true],
    ]);
    const next = apply(document, { type: "edge.pause", edgeId: "primary", hasPause: undefined }).document;
    expect(Object.hasOwn(next.edges[0], "hasPause")).toBe(false);
    expect(next.edges[1]).toBe(document.edges[1]);
    expect(next.nodes).toBe(document.nodes);
  });

  it("rejects wrong types, single-port overflow and cycles atomically", () => {
    const document = base();
    const original = structuredClone(document);
    const invalid = applySpaceEditorCommand(document, { type: "batch", commands: [
      { type: "node.move", nodeId: "b", position: { x: 90, y: 10 } },
      { type: "edge.connect", edge: { id: "one", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference" } },
      { type: "edge.connect", edge: { id: "two", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference" } },
    ] });
    expect(invalid).toMatchObject({ ok: false, message: "PORT_CARDINALITY_EXCEEDED" });
    expect(document).toEqual(original);
    const cycle = applySpaceEditorCommand(document, { type: "batch", commands: [
      { type: "edge.connect", edge: { id: "ab", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference" } },
      { type: "edge.connect", edge: { id: "ba", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "a", targetPortId: "reference" } },
    ] });
    expect(cycle).toMatchObject({ ok: false, message: "GRAPH_CYCLE" });
    const wrong = applySpaceEditorCommand(document, { type: "batch", commands: [
      { type: "node.add", node: { id: "text", kind: "input.prompt", position: { x: 0, y: 0 } } },
      { type: "edge.connect", edge: { id: "wrong", sourceNodeId: "text", sourcePortId: "text", targetNodeId: "relay", targetPortId: "reference" } },
    ] });
    expect(wrong).toMatchObject({ ok: false, message: "PORT_VALUE_TYPE_MISMATCH" });
  });

  it("replaces a single input and preserves an explicit replacement ID/order/pause", () => {
    const document = apply(base(), { type: "edge.connect", edge: { id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference", hasPause: false } }).document;
    const next = apply(document, { type: "edge.replace", edgeId: "wire", edge: { sourceNodeId: "b", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference" } }).document;
    expect(next.edges).toEqual([{ id: "wire", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference", sortOrder: 0, hasPause: false }]);
    expect(next.nodes).toBe(document.nodes);
  });

  it("reorders active Gallery inputs without changing edge array order or pause", () => {
    const document: SpaceEditorDocument = { ...base(), nodes: [
      image("a"), image("b"), { ...image("gallery"), kind: "output.gallery", config: { mediaType: "image" } },
    ], edges: [
      { id: "ea", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 0, hasPause: false },
      { id: "eb", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 1 },
    ] };
    const next = apply(document, { type: "edge.reorder", targetNodeId: "gallery", targetPortId: "image", edgeIds: ["eb", "ea"] }).document;
    expect(next.edges.map((edge) => [edge.id, edge.sortOrder])).toEqual([["ea", 1], ["eb", 0]]);
    expect(next.edges[0].hasPause).toBe(false);
    expect(Object.hasOwn(next.edges[1], "hasPause")).toBe(false);
    expect(next.nodes[2].config).toBe(document.nodes[2].config);
    expect(applySpaceEditorCommand(document, { type: "edge.reorder", targetNodeId: "gallery", targetPortId: "image", edgeIds: ["ea", "ea"] })).toMatchObject({ ok: false, code: "INVALID_ORDER" });
  });

  it("preserves hidden Stitch edge IDs, clip order and pause while rejecting new ordering", () => {
    const document: SpaceEditorDocument = { ...base(), nodes: [
      { ...image("a"), kind: "input.video" }, { ...image("b"), kind: "input.video" },
      { ...image("stitch"), kind: "edit.video.stitch", config: { parameters: { clipOrder: ["ea", "eb"] } } },
    ], edges: [
      { id: "ea", sourceNodeId: "a", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 0, hasPause: false },
      { id: "eb", sourceNodeId: "b", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 1 },
    ] };
    const original = structuredClone(document);
    expect(applySpaceEditorCommand(document, { type: "edge.reorder", targetNodeId: "stitch", targetPortId: "clips", edgeIds: ["eb", "ea"] })).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    expect(apply(document, { type: "title.set", title: "Renamed" }).document).toEqual({ ...original, title: "Renamed" });
    expect(document).toEqual(original);
  });

  it("releases a fixed result binding on incoming-wire changes, retaining the asset", () => {
    const document = base();
    document.nodes[1] = { ...document.nodes[1], config: { assetId: "finished", resultSource: { nodeId: "relay", executionId: "exec", portId: "image", index: 0, state: "completed" } } };
    const next = apply(document, { type: "edge.connect", edge: { id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference" } }).document;
    expect(next.nodes[1].config).toEqual({ assetId: "finished" });
    expect(next.nodes[0]).toBe(document.nodes[0]);
  });

  it("resets execution association on explicit asset replace/clear and retains output count", () => {
    const document = base();
    document.nodes[0] = { ...document.nodes[0], config: { assetId: "old", resultSource: { nodeId: "relay", executionId: "exec", portId: "image", index: 1, outputCount: 2, state: "completed" } } };
    const next = apply(document, { type: "node.config.patch", nodeId: "a", patch: { assetId: "new" } }).document;
    expect(next.nodes[0].config).toMatchObject({ assetId: "new", resultSource: { executionId: null, portId: "image", index: 1, outputCount: 2, state: "completed" } });
    const cleared = apply(next, { type: "node.config.patch", nodeId: "a", patch: { assetId: null } }).document;
    expect(cleared.nodes[0].config).toMatchObject({ assetId: null, resultSource: { executionId: null, state: "cancelled" } });
  });

  it("cancels only pending Gallery reservations on their detached wire and retains frozen assets and unrelated slots", () => {
    const item = (id: string, nodeId: string, state: "pending" | "completed") => ({ id, nodeId, executionId: "run", portId: "image", index: 0,
      mediaType: "image", assetId: state === "completed" ? "captured" : null, state });
    const gallery = { ...image("gallery"), kind: "output.gallery", config: { mediaType: "image", resultItems: [item("done", "relay", "completed"), item("pending", "relay", "pending"), item("other", "a", "pending")] } };
    const document: SpaceEditorDocument = { ...base(), nodes: [...base().nodes, gallery], edges: [
      { id: "generated", sourceNodeId: "relay", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 0 },
      { id: "manual", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: 1 },
    ] };
    const paused = apply(document, { type: "edge.pause", edgeId: "generated", hasPause: true }).document;
    expect(paused.nodes.at(-1)?.config).toEqual(gallery.config);
    const detached = apply(paused, { type: "edge.disconnect", edgeId: "generated" }).document;
    expect(detached.nodes.at(-1)?.config).toMatchObject({ resultItems: [
      { assetId: "captured", executionId: "run", state: "completed" }, { executionId: null, state: "cancelled" }, { executionId: "run", state: "pending" },
    ] });
    expect(detached.nodes[0]).toBe(document.nodes[0]);
  });

  it("allows retired moves/deletion/read and rejects config, duplicate, create, incident connect, pause and order", () => {
    const document: SpaceEditorDocument = { ...base(), nodes: [image("a"), { ...image("gif"), kind: "edit.image.gif", config: { parameters: { clipOrder: ["e"] } } }], edges: [
      { id: "e", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames", sortOrder: 0 },
    ] };
    expect(analyzeCanonicalGraphSupport(document).writable).toBe(true);
    expect(apply(document, { type: "node.move", nodeId: "gif", position: { x: 20, y: 30 } }).document.nodes[1].config).toBe(document.nodes[1].config);
    expect(apply(document, { type: "node.remove", nodeId: "gif" }).document.nodes).toHaveLength(1);
    const commands: SpaceEditorCommand[] = [
      { type: "node.config.patch", nodeId: "gif", patch: { parameters: { fps: 12 } } },
      { type: "nodes.duplicate", nodeIds: ["gif"] },
      { type: "node.add", node: { kind: "edit.image.gif", id: "copy", position: { x: 0, y: 0 } } },
      { type: "edge.connect", edge: { id: "other", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "gif", targetPortId: "frames" } },
      { type: "edge.pause", edgeId: "e", hasPause: true },
      { type: "edge.reorder", targetNodeId: "gif", targetPortId: "frames", edgeIds: ["e"] },
    ];
    for (const command of commands) expect(applySpaceEditorCommand(document, command)).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    const transformed = prepareSpaceEditorTransaction(document, { ...document, nodes: document.nodes.map((node) => node.id === "gif" ? { ...node, config: { parameters: { fps: 9 } } } : node) }, { origin: "user" });
    expect(transformed).toMatchObject({ ok: false, code: "RETIRED_NODE" });
  });

  it("rejects reusing a retired edge ID after replacing its original retired endpoints", () => {
    const document: SpaceEditorDocument = { ...base(), nodes: [...base().nodes,
      { ...image("annotation"), kind: "edit.image.annotation", config: { parameters: {} } },
    ], edges: [{ id: "retired-wire", sourceNodeId: "annotation", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference", sortOrder: 0, hasPause: false }] };
    const replacement = { sourceNodeId: "a", sourcePortId: "image", targetNodeId: "relay", targetPortId: "reference" };
    const original = structuredClone(document);
    for (const command of [
      { type: "edge.replace", edgeId: "retired-wire", edge: replacement },
      { type: "edge.replace", edge: { ...replacement, id: "retired-wire" } },
      { type: "batch", commands: [
        { type: "node.remove", nodeId: "annotation" },
        { type: "edge.connect", edge: { ...replacement, id: "retired-wire" } },
      ] },
    ] satisfies SpaceEditorCommand[]) {
      expect(applySpaceEditorCommand(document, command)).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    }
    expect(prepareSpaceEditorTransaction(document, { ...document, edges: [{ ...document.edges[0], ...replacement }] }, { origin: "user" }))
      .toMatchObject({ ok: false, code: "RETIRED_NODE" });
    expect(document).toEqual(original);
    const replaced = apply(document, { type: "edge.replace", edgeId: "retired-wire", edge: { ...replacement, id: "fresh-wire" } }).document;
    expect(replaced.edges).toEqual([{ ...replacement, id: "fresh-wire", sortOrder: 0, hasPause: false }]);
    expect(replaced.nodes).toBe(document.nodes);
    const fresh = apply(document, { type: "edge.replace", edge: { ...replacement, id: "another-fresh-wire" } }).document;
    expect(fresh.edges[0].id).toBe("another-fresh-wire");
  });

  it("disconnects retired inputs without applying missing config defaults", () => {
    const legacy = { parameters: {} };
    const document: SpaceEditorDocument = { ...base(), nodes: [image("a"), { ...image("annotation"), kind: "edit.image.annotation", config: legacy }],
      edges: [{ id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "annotation", targetPortId: "image", sortOrder: 0 }] };
    const next = apply(document, { type: "edge.disconnect", edgeId: "wire" }).document;
    expect(next.edges).toEqual([]);
    expect(next.nodes[1]).toBe(document.nodes[1]);
    expect(next.nodes[1].config).toBe(legacy);
  });

  it("preserves unknown JSON unchanged and respects server and future-config read-only state", () => {
    const document = { ...base(), nodes: [{ ...image("future"), configVersion: 9, config: { unknown: { false: false, zero: 0, null: null, array: [1, "", null] } } }] };
    const saved = structuredClone(document);
    expect(applySpaceEditorCommand(document, { type: "node.move", nodeId: "future", position: { x: 1, y: 1 } })).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(document).toEqual(saved);
    expect(applySpaceEditorCommand(base(), { type: "title.set", title: "Denied" }, { writable: false })).toMatchObject({ ok: false, code: "READ_ONLY" });
  });
});

describe("whole-operation admission", () => {
  it("accepts exactly 500 nodes / 2000 edges / 500 groups and atomically rejects each overflow", () => {
    const nodes = Array.from({ length: 499 }, (_, index) => image(`n${index}`));
    nodes.push({ ...image("gallery"), kind: "output.gallery", config: { mediaType: "image" } });
    const document: SpaceEditorDocument = {
      schemaVersion: 3, title: "Limits", nodes,
      edges: Array.from({ length: 2000 }, (_, index) => ({ id: `e${index}`, sourceNodeId: `n${index % 499}`, sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: index })),
      groups: Array.from({ length: 500 }, (_, index) => ({ id: `g${index}`, title: `Group ${index}`, color: "neutral", locked: false, bounds: { x: 0, y: 0, width: 200, height: 100 }, memberNodeIds: [] })),
    };
    expect(validateSpaceEditorDocument(document)).toBeNull();
    expect(apply(document, { type: "title.set", title: "Accepted at all limits" }).document.nodes).toBe(document.nodes);
    expect(applySpaceEditorCommand(document, { type: "node.add", node: { ...image("overflow") } })).toMatchObject({ ok: false, code: "NODE_LIMIT" });
    expect(applySpaceEditorCommand(document, { type: "edge.connect", edge: { id: "overflow", sourceNodeId: "n0", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image" } })).toMatchObject({ ok: false, code: "EDGE_LIMIT" });
    expect(applySpaceEditorCommand(document, { type: "group.create", id: "overflow", memberNodeIds: ["n0"] })).toMatchObject({ ok: false, code: "GROUP_LIMIT" });
    expect(document.nodes).toHaveLength(500);
    expect(document.edges).toHaveLength(2000);
    expect(document.groups).toHaveLength(500);
  });

  it("admits an atomic replacement at capacity, validating the final graph only", () => {
    const document = { ...base(), nodes: Array.from({ length: 500 }, (_, index) => image(`n${index}`)) };
    const next = apply(document, { type: "batch", commands: [
      { type: "node.add", node: { ...image("replacement") } },
      { type: "node.remove", nodeId: "n0" },
    ] }).document;
    expect(next.nodes).toHaveLength(500);
    expect(next.nodes[499].id).toBe("replacement");
  });
});
