import { describe, expect, it } from "vitest";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { validateNodeConfig, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { analyzeCanonicalGraphSupport } from "@/shared/generation-graph/canonical-graph";
import type { GraphDraft } from "../hook/use-graph-autosave";
import type { NodeExecutionDto } from "./node-execution-types";
import {
  bindResultNodes,
  appendCapturedFrameResult,
  automaticResultPorts,
  reconcileResultNodes,
  reserveResultNodes,
  resultGalleryItems,
  resultSource,
  unsubmittedResultIds,
} from "./generation-result-nodes";

type ResultExecution = Pick<NodeExecutionDto, "executionId" | "status" | "outputAssetIds" | "outputBindings">;
function node(id: string, kind: CanonicalNodeKind, patch: Partial<GraphDraft["nodes"][number]> = {}): GraphDraft["nodes"][number] {
  return { id, kind, configVersion: 1, position: { x: 40, y: 80 }, config: defaultConfigForKind(kind), selectedOutputAssetId: null, ...patch };
}
function graph(kind: CanonicalNodeKind = "generate.image", config?: GraphDraft["nodes"][number]["config"]): GraphDraft {
  return { schemaVersion: 3, title: "Result snapshots", nodes: [node("producer", kind, config ? { config } : {})], edges: [], groups: [] };
}
function receipt(executionId: string, status: NodeExecutionDto["status"], outputAssetIds: string[] = [], outputBindings?: ResultExecution["outputBindings"]): ResultExecution {
  return { executionId, status, outputAssetIds, ...(outputBindings ? { outputBindings } : {}) };
}
it.each(["input.video", "output.single"] as const)("appends typed frozen capture results from %s without replacing a previous result or the source", kind => {
  const before = graph(kind), first = appendCapturedFrameResult(before, "producer", "first-capture"), second = appendCapturedFrameResult(first.draft, "producer", "second-capture");
  expect(second.draft.nodes[0]).toBe(before.nodes[0]);
  expect(second.draft.nodes.slice(1).map(node => node.config)).toEqual(["first-capture", "second-capture"].map(assetId => ({
    assetId, resultSource: { nodeId: "producer", executionId: null, portId: "capturedFrame", index: 0, state: "completed" },
  })));
  expect(second.draft.edges.map(edge => ({ source: edge.sourceNodeId, port: edge.sourcePortId, target: edge.targetNodeId, input: edge.targetPortId }))).toEqual([
    { source: "producer", port: "capturedFrame", target: first.ids[0], input: "reference" },
    { source: "producer", port: "capturedFrame", target: second.ids[0], input: "reference" },
  ]);
  expect(second.draft.nodes[1].position).not.toEqual(second.draft.nodes[2].position);
  expect(analyzeCanonicalGraphSupport(second.draft).writable).toBe(true);
  expect(automaticResultPorts(kind)).toEqual([]);
  expect(() => appendCapturedFrameResult(graph(), "producer", "capture")).toThrow("CAPTURE_SOURCE_INVALID");
});
function gallery(draft: GraphDraft, id?: string) {
  const matches = draft.nodes.filter(item => item.kind === "output.gallery" && (!id || item.id === id));
  expect(matches).toHaveLength(1);
  const result = matches[0], items = resultGalleryItems(result.config);
  expect(items).not.toBeNull();
  expect(validateNodeConfig(result.kind, result.configVersion, result.config).supported).toBe(true);
  return { node: result, items: items! };
}
function graphAtNodeCount(count: number): GraphDraft {
  const draft = graph();
  return { ...draft, nodes: [...draft.nodes, ...Array.from({ length: count - 1 }, (_, index) =>
    node(`memo-${index}`, "note.memo", { position: { x: 3_000 + index * 500, y: 0 } }))] };
}
function graphAtEdgeCount(count: number, kind: CanonicalNodeKind): GraphDraft {
  const draft = graph(kind, kind === "edit.video.extractFrames" ? { parameters: {} } : undefined);
  return { ...draft, nodes: [...draft.nodes, node("existing-gallery", "output.gallery")],
    edges: Array.from({ length: count }, (_, index) => ({ id: `edge-${index}`, sourceNodeId: "producer", sourcePortId: kind === "generate.image" ? "image" : "startFrame",
      targetNodeId: "existing-gallery", targetPortId: "image", sortOrder: index })) };
}

describe("generation result reservations", () => {
  it("reserves one positioned Gallery with stable, distinct slot groups for the whole repeat batch", () => {
    const draft = graph();
    draft.nodes.push(node("occupied", "note.memo", { position: { x: 660, y: 80 } }));
    const original = structuredClone(draft), reserved = reserveResultNodes(draft, "producer", 4);
    const { node: result, items } = gallery(reserved.draft);
    expect(draft).toEqual(original);
    expect(reserved.draft.nodes).toHaveLength(3);
    expect(reserved.draft.nodes.slice(0, 2)).toEqual(draft.nodes);
    expect(reserved.draft.nodes.filter(item => item.kind.startsWith("input."))).toEqual([]);
    expect(result.position).toEqual({ x: 660, y: 520 });
    expect(reserved.groups.map(group => group.length)).toEqual([1, 1, 1, 1]);
    expect(reserved.groups.flat()).toEqual(items.map(item => item.id));
    expect(new Set([result.id, ...reserved.groups.flat()]).size).toBe(5);
    for (const item of items) {
      expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(item).toMatchObject({ nodeId: "producer", executionId: null, portId: "image", index: 0, state: "pending", mediaType: "image", assetId: null });
    }
    expect(result.config).toMatchObject({ mediaType: "image", excludedAssetIds: [] });
    expect(reserved.draft.edges).toEqual([expect.objectContaining({ sourceNodeId: "producer", sourcePortId: "image", targetNodeId: result.id, targetPortId: "image" })]);
    expect(unsubmittedResultIds(reserved.draft)).toEqual(reserved.groups.flat());
  });

  it.each(["image", "audio", "video"] as const)("keeps a single %s output as the existing automatic Input contract", type => {
    const reserved = reserveResultNodes(graph(`generate.${type}`), "producer");
    const input = reserved.draft.nodes[1];
    expect(reserved.draft.nodes).toHaveLength(2);
    expect(input.kind).toBe(`input.${type}`);
    expect(reserved.groups).toEqual([[input.id]]);
    expect(input.config).toMatchObject({ assetId: null, resultSource: { nodeId: "producer", executionId: null, portId: type, index: 0, state: "pending" } });
    expect(reserved.draft.edges[0]).toMatchObject({ sourceNodeId: "producer", sourcePortId: type, targetNodeId: input.id, targetPortId: type === "image" ? "reference" : type });
    expect(unsubmittedResultIds(reserved.draft)).toEqual([input.id]);
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "single");
    expect(unsubmittedResultIds(bound)).toEqual([]);
    const completed = reconcileResultNodes(bound, "producer", receipt("single", "completed", ["fixed"]));
    expect(completed.nodes[1]).toMatchObject({ id: input.id, kind: `input.${type}`, position: input.position,
      config: { assetId: "fixed", resultSource: { executionId: "single", state: "completed", outputCount: 1 } } });
    expect(completed.edges).toEqual(reserved.draft.edges);
    expect(validateNodeConfig(input.kind, input.configVersion, completed.nodes[1].config).supported).toBe(true);
    expect(reconcileResultNodes(completed, "producer", receipt("single", "completed", ["changed"]))).toBe(completed);
  });

  it("reserves both frame ports in one Gallery and binds by port rather than representative order", () => {
    const reserved = reserveResultNodes(graph("edit.video.extractFrames", { parameters: {} }), "producer");
    const before = gallery(reserved.draft), bound = bindResultNodes(reserved.draft, reserved.groups[0], "frames");
    expect(reserved.groups).toEqual([before.items.map(item => item.id)]);
    expect(before.items.map(item => [item.portId, item.index])).toEqual([["startFrame", 0], ["endFrame", 0]]);
    expect(reserved.draft.nodes).toHaveLength(2);
    expect(reserved.draft.edges.map(edge => [edge.sourcePortId, edge.targetNodeId, edge.targetPortId])).toEqual([
      ["startFrame", before.node.id, "image"], ["endFrame", before.node.id, "image"],
    ]);
    const completed = reconcileResultNodes(bound, "producer", receipt("frames", "completed", ["end", "start"], [
      { portId: "endFrame", sortOrder: 0, assetId: "end" }, { portId: "startFrame", sortOrder: 0, assetId: "start" },
    ]));
    const after = gallery(completed);
    expect(after.items.map(item => item.id)).toEqual(reserved.groups[0]);
    expect(after.items.map(item => [item.portId, item.assetId, item.state])).toEqual([["startFrame", "start", "completed"], ["endFrame", "end", "completed"]]);
    expect(reconcileResultNodes(completed, "producer", receipt("frames", "completed", ["new"]))).toBe(completed);
  });

  it("reserves a single frame Input for timestamp mode and retains its exact frozen execution binding", () => {
    const draft = graph("edit.video.extractFrames"), original = structuredClone(draft);
    expect(automaticResultPorts("edit.video.extractFrames", draft.nodes[0].config).map(port => port.id)).toEqual(["frame"]);
    const reserved = reserveResultNodes(draft, "producer"), input = reserved.draft.nodes[1];
    expect(draft).toEqual(original);
    expect(reserved.groups).toEqual([[input.id]]);
    expect(input).toMatchObject({ kind: "input.image", config: { assetId: null,
      resultSource: { nodeId: "producer", portId: "frame", index: 0, executionId: null, state: "pending" } } });
    expect(reserved.draft.edges).toEqual([expect.objectContaining({ sourcePortId: "frame", targetNodeId: input.id, targetPortId: "reference" })]);
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "point");
    const changed = { ...bound, nodes: bound.nodes.map(node => node.id === "producer" ? { ...node, config: { parameters: {} } } : node) };
    const completed = reconcileResultNodes(changed, "producer", receipt("point", "completed", ["end", "chosen"], [
      { portId: "endFrame", sortOrder: 0, assetId: "end" }, { portId: "frame", sortOrder: 0, assetId: "chosen" },
    ]));
    expect(completed.nodes[1]).toMatchObject({ id: input.id, config: { assetId: "chosen",
      resultSource: { portId: "frame", executionId: "point", state: "completed", outputCount: 1 } } });
    expect(completed.edges).toEqual(reserved.draft.edges);
    expect(reconcileResultNodes(completed, "producer", receipt("point", "completed", ["late"], [
      { portId: "frame", sortOrder: 0, assetId: "late" },
    ]))).toBe(completed);
    const deleted = { ...bound, nodes: bound.nodes.filter(node => node.id !== input.id), edges: [] };
    expect(reconcileResultNodes(deleted, "producer", receipt("point", "completed", ["late"], [
      { portId: "frame", sortOrder: 0, assetId: "late" },
    ]))).toBe(deleted);
  });

  it("preserves pending legacy ports across a mode change and never fills them from an unnamed point result", () => {
    const reserved = reserveResultNodes(graph("edit.video.extractFrames", { parameters: {} }), "producer");
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "old");
    const changed = { ...bound, nodes: bound.nodes.map(node => node.id === "producer" ? { ...node, config: { parameters: { timestampMs: 0 } } } : node) };
    const completed = reconcileResultNodes(changed, "producer", receipt("old", "completed", ["first", "last"], [
      { portId: "startFrame", sortOrder: 0, assetId: "first" }, { portId: "endFrame", sortOrder: 0, assetId: "last" },
    ]));
    expect(gallery(completed).items.map(item => [item.portId, item.assetId])).toEqual([["startFrame", "first"], ["endFrame", "last"]]);
    expect(gallery(reconcileResultNodes(changed, "producer", receipt("old", "completed", ["point-only"]))).items
      .map(item => [item.portId, item.assetId, item.state])).toEqual([["startFrame", null, "failed"], ["endFrame", null, "failed"]]);
    const point = reserveResultNodes(graph("edit.video.extractFrames"), "producer");
    const pointBound = bindResultNodes(point.draft, point.groups[0], "new");
    const wrong = reconcileResultNodes(pointBound, "producer", receipt("new", "completed", ["last"], [
      { portId: "endFrame", sortOrder: 0, assetId: "last" },
    ]));
    expect(wrong.nodes[1].config).toMatchObject({ assetId: null, resultSource: { portId: "frame", state: "failed" } });
  });

  it("binds only the selected pending slot to its execution and refuses another receipt's results", () => {
    const reserved = reserveResultNodes(graph(), "producer", 2);
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "accepted");
    expect(gallery(bound).items.map(item => item.executionId)).toEqual(["accepted", null]);
    expect(unsubmittedResultIds(bound)).toEqual(reserved.groups[1]);
    const rebound = bindResultNodes(bound, reserved.groups[0], "unrelated");
    expect(gallery(rebound).items).toEqual(gallery(bound).items);
    expect(reconcileResultNodes(bound, "producer", receipt("unrelated", "completed", ["wrong"]))).toBe(bound);
    const completed = reconcileResultNodes(bound, "producer", receipt("accepted", "completed", ["right"]));
    expect(gallery(completed).items).toMatchObject([
      { executionId: "accepted", state: "completed", assetId: "right" }, { executionId: null, state: "pending", assetId: null },
    ]);
    expect(gallery(bindResultNodes(completed, reserved.groups[0], "accepted", "cancelled")).items).toEqual(gallery(completed).items);
  });

  it("keeps repeat ordering through extra outputs, partial failure, accepted cancellation and unsubmitted cancellation", () => {
    const reserved = reserveResultNodes(graph(), "producer", 4);
    let draft = bindResultNodes(reserved.draft, reserved.groups[0], "run-0");
    draft = reconcileResultNodes(draft, "producer", receipt("run-0", "completed", ["a", "b"]));
    draft = bindResultNodes(draft, reserved.groups[1], "run-1");
    draft = reconcileResultNodes(draft, "producer", receipt("run-1", "failed", ["ignored-partial"]));
    draft = bindResultNodes(draft, reserved.groups[2], "run-2");
    draft = reconcileResultNodes(draft, "producer", receipt("run-2", "cancelled"));
    expect(unsubmittedResultIds(draft)).toEqual(reserved.groups[3]);
    draft = bindResultNodes(draft, unsubmittedResultIds(draft), null, "cancelled");
    const { node: result, items } = gallery(draft);
    expect(draft.nodes).toHaveLength(2);
    expect(result.id).toBe(reserved.draft.nodes[1].id);
    expect(items.map(item => [item.executionId, item.index, item.assetId, item.state])).toEqual([
      ["run-0", 0, "a", "completed"], ["run-0", 1, "b", "completed"], ["run-1", 0, null, "failed"],
      ["run-2", 0, null, "cancelled"], [null, 0, null, "cancelled"],
    ]);
    expect(items.filter(item => reserved.groups.flat().includes(item.id)).map(item => item.id)).toEqual(reserved.groups.flat());
    expect(unsubmittedResultIds(draft)).toEqual([]);
    expect(reconcileResultNodes(draft, "producer", receipt("run-0", "completed", ["changed", "changed", "extra"]))).toBe(draft);
    expect(reconcileResultNodes(draft, "producer", receipt("run-1", "completed", ["late"]))).toBe(draft);
    expect(reconcileResultNodes(draft, "producer", receipt("run-2", "completed", ["late"]))).toBe(draft);
  });

  it("limits stop candidates to pending unbound slots and leaves a different batch untouched", () => {
    const first = reserveResultNodes(graph(), "producer", 2);
    const bound = bindResultNodes(first.draft, first.groups[0], "accepted");
    const second = reserveResultNodes(bound, "producer", 2);
    expect(unsubmittedResultIds(second.draft, [])).toEqual([]);
    expect(unsubmittedResultIds(second.draft, ["absent", ...first.groups.flat()])).toEqual(first.groups[1]);
    const stopped = bindResultNodes(second.draft, unsubmittedResultIds(second.draft, first.groups.flat()), null, "failed");
    expect(gallery(stopped, first.draft.nodes[1].id).items).toMatchObject([
      { executionId: "accepted", state: "pending" }, { executionId: null, state: "failed" },
    ]);
    expect(unsubmittedResultIds(stopped)).toEqual(second.groups.flat());
    expect(gallery(stopped, second.draft.nodes[2].id).items.map(item => item.state)).toEqual(["pending", "pending"]);
  });

  it("never recreates a deleted Gallery or its slots when a late completion or receipt arrives", () => {
    const reserved = reserveResultNodes(graph(), "producer", 3);
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "accepted");
    const deleted = { ...bound, nodes: [bound.nodes[0]], edges: [] };
    expect(reconcileResultNodes(deleted, "producer", receipt("accepted", "completed", ["one", "two"]))).toBe(deleted);
    expect(bindResultNodes(deleted, reserved.groups[1], "late")).toEqual(deleted);
    expect(unsubmittedResultIds(deleted)).toEqual([]);
  });

  it("promotes unexpected native multiple outputs in place, keeping the node, wire, position and presentation", () => {
    const reserved = reserveResultNodes(graph(), "producer"), input = reserved.draft.nodes[1];
    const draft = { ...reserved.draft, nodes: reserved.draft.nodes.map(item => item.id === input.id ? { ...item,
      config: { assetId: null, resultSource: resultSource(item.config)!, presentation: { customTitle: "My results", comment: "Keep" } } } : item) };
    const bound = bindResultNodes(draft, reserved.groups[0], "native");
    const completed = reconcileResultNodes(bound, "producer", receipt("native", "completed", ["first", "second", "third"]));
    const { node: result, items } = gallery(completed);
    expect(completed.nodes).toHaveLength(2);
    expect(result).toMatchObject({ id: input.id, configVersion: input.configVersion, position: input.position, selectedOutputAssetId: input.selectedOutputAssetId,
      config: { presentation: { customTitle: "My results", comment: "Keep" } } });
    expect(resultSource(result.config)).toBeNull();
    expect(items.map(item => [item.executionId, item.index, item.assetId, item.outputCount, item.state])).toEqual([
      ["native", 0, "first", 3, "completed"], ["native", 1, "second", 3, "completed"], ["native", 2, "third", 3, "completed"],
    ]);
    expect(completed.edges).toEqual([{ ...reserved.draft.edges[0], targetPortId: "image" }]);
    expect(reconcileResultNodes(completed, "producer", receipt("native", "completed", ["first", "second", "third"]))).toBe(completed);
  });

  it("preserves a manually wired first-result extraction and adds one Gallery without retargeting the downstream wire", () => {
    const reserved = reserveResultNodes(graph(), "producer"), input = reserved.draft.nodes[1];
    const downstream = node("resize", "edit.image.resize");
    const wire = { id: "user-extraction", sourceNodeId: input.id, sourcePortId: "image", targetNodeId: downstream.id, targetPortId: "image", sortOrder: 0 };
    const draft = { ...reserved.draft, nodes: [...reserved.draft.nodes, downstream], edges: [...reserved.draft.edges, wire] };
    const bound = bindResultNodes(draft, reserved.groups[0], "native");
    const completed = reconcileResultNodes(bound, "producer", receipt("native", "completed", ["one", "two"]));
    const { node: result, items } = gallery(completed);
    expect(completed.nodes).toHaveLength(4);
    expect(completed.nodes.find(item => item.id === input.id)).toMatchObject({ kind: "input.image", position: input.position,
      config: { assetId: "one", resultSource: { executionId: "native", index: 0, state: "completed" } } });
    expect(completed.nodes.find(item => item.id === downstream.id)).toBe(downstream);
    expect(completed.edges.filter(edge => edge.targetNodeId !== result.id)).toEqual(draft.edges);
    expect(completed.edges.find(edge => edge.id === wire.id)).toBe(wire);
    expect(items.map(item => item.assetId)).toEqual(["one", "two"]);
    expect(reconcileResultNodes(completed, "producer", receipt("native", "completed", ["one", "two"]))).toBe(completed);
  });

  it.each([false, true])("keeps missing output binding indexes failed without shifting a later asset (explicit null: %s)", explicitNull => {
    const reserved = reserveResultNodes(graph(), "producer");
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "sparse");
    const bindings: NonNullable<ResultExecution["outputBindings"]> = [
      { portId: "image", sortOrder: 2, assetId: "third" }, { portId: "unrelated", sortOrder: 0, assetId: "wrong-port" },
    ];
    if (explicitNull) bindings.push({ portId: "image", sortOrder: 0, assetId: null });
    const completed = reconcileResultNodes(bound, "producer", receipt("sparse", "completed", ["third"], bindings));
    expect(gallery(completed).items.map(item => [item.index, item.assetId, item.state, item.outputCount])).toEqual([
      [0, null, "failed", 3], [1, null, "failed", 3], [2, "third", "completed", 3],
    ]);
  });

  it("never fills a missing frame port from another port or from the representative asset", () => {
    const reserved = reserveResultNodes(graph("edit.video.extractFrames", { parameters: {} }), "producer");
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "frames");
    const completed = reconcileResultNodes(bound, "producer", receipt("frames", "completed", ["representative", "end"], [
      { portId: "endFrame", sortOrder: 0, assetId: "end" },
    ]));
    expect(gallery(completed).items.map(item => [item.portId, item.assetId, item.state])).toEqual([
      ["startFrame", null, "failed"], ["endFrame", "end", "completed"],
    ]);
  });

  it("keeps old completed Inputs and Gallery snapshots unchanged after later executions and producer selections", () => {
    const first = reserveResultNodes(graph(), "producer");
    let draft = reconcileResultNodes(bindResultNodes(first.draft, first.groups[0], "old-input"), "producer", receipt("old-input", "completed", ["old-single"]));
    const second = reserveResultNodes(draft, "producer", 2);
    draft = reconcileResultNodes(bindResultNodes(second.draft, second.groups[0], "old-gallery"), "producer", receipt("old-gallery", "completed", ["old-a", "old-b"]));
    draft = reconcileResultNodes(bindResultNodes(draft, second.groups[1], "old-gallery-2"), "producer", receipt("old-gallery-2", "completed", ["old-c"]));
    const oldInput = draft.nodes[1], oldGallery = draft.nodes[2], snapshots = structuredClone([oldInput, oldGallery]);
    const third = reserveResultNodes(draft, "producer");
    draft = bindResultNodes(third.draft, third.groups[0], "new");
    draft = { ...draft, nodes: draft.nodes.map(item =>
      item.id === "producer" ? { ...item, selectedOutputAssetId: "user-selected" } : item) };
    draft = reconcileResultNodes(draft, "producer", receipt("new", "completed", ["latest"]));
    expect(draft.nodes[0].selectedOutputAssetId).toBe("user-selected");
    expect(draft.nodes.find(item => item.id === oldInput.id)).toBe(oldInput);
    expect(draft.nodes.find(item => item.id === oldGallery.id)).toBe(oldGallery);
    expect([oldInput, oldGallery]).toEqual(snapshots);
    expect(reconcileResultNodes(draft, "producer", receipt("old-input", "completed", ["replacement", "extra"]))).toBe(draft);
    expect(reconcileResultNodes(draft, "producer", receipt("old-gallery", "completed", ["replacement", "extra", "more"]))).toBe(draft);
    const withoutProducer = { ...draft, nodes: draft.nodes.filter(item => item.id !== "producer"), edges: [] };
    expect(reconcileResultNodes(withoutProducer, "producer", receipt("old-gallery", "completed", ["replacement"]))).toBe(withoutProducer);
    expect(gallery(withoutProducer).items.filter(item => item.state === "completed").map(item => item.assetId)).toEqual(["old-a", "old-b", "old-c"]);
  });

  it.each(["completed", "failed", "cancelled"] as const)("makes terminal %s reconciliation idempotent and does not accept a later state change", status => {
    const reserved = reserveResultNodes(graph(), "producer", 2);
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "terminal");
    const terminal = receipt("terminal", status, status === "completed" ? ["fixed"] : []);
    const completed = reconcileResultNodes(bound, "producer", terminal);
    expect(gallery(completed).items[0]).toMatchObject({ state: status, executionId: "terminal", assetId: status === "completed" ? "fixed" : null });
    expect(reconcileResultNodes(completed, "producer", terminal)).toBe(completed);
    expect(reconcileResultNodes(completed, "producer", receipt("terminal", "completed", ["changed", "extra"]))).toBe(completed);
    expect(gallery(bindResultNodes(completed, reserved.groups[0], "different")).items).toEqual(gallery(completed).items);
  });
});

describe("generation result limits", () => {
  it("allows exactly 500 reserved entries and rejects 501 without changing the graph", () => {
    const draft = graph(), original = structuredClone(draft);
    const reserved = reserveResultNodes(draft, "producer", 500);
    expect(reserved.draft.nodes).toHaveLength(2);
    expect(reserved.draft.edges).toHaveLength(1);
    expect(reserved.groups).toHaveLength(500);
    expect(gallery(reserved.draft).items).toHaveLength(500);
    expect(() => reserveResultNodes(draft, "producer", 501)).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(draft).toEqual(original);
  });

  it.each([1, 4])("enforces the 500-node graph limit before reserving a batch of %s", repeat => {
    const allowed = graphAtNodeCount(499), full = graphAtNodeCount(500), original = structuredClone(full);
    expect(reserveResultNodes(allowed, "producer", repeat).draft.nodes).toHaveLength(500);
    expect(() => reserveResultNodes(full, "producer", repeat)).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(full).toEqual(original);
  });

  it.each([
    ["generate.image", 4, 1], ["edit.video.extractFrames", 1, 2],
  ] as const)("counts distinct %s ports against the 2,000-edge limit", (kind, repeat, ports) => {
    const allowed = graphAtEdgeCount(2_000 - ports, kind), full = graphAtEdgeCount(2_001 - ports, kind), original = structuredClone(full);
    const reserved = reserveResultNodes(allowed, "producer", repeat);
    expect(reserved.draft.edges).toHaveLength(2_000);
    expect(reserved.draft.nodes).toHaveLength(3);
    expect(() => reserveResultNodes(full, "producer", repeat)).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(full).toEqual(original);
  });

  it("enforces the total Gallery entry limit across expanded repeats without changing prior results", () => {
    const reserved = reserveResultNodes(graph(), "producer", 2);
    const first = bindResultNodes(reserved.draft, reserved.groups[0], "first");
    const accepted = reconcileResultNodes(first, "producer", receipt("first", "completed", Array.from({ length: 499 }, (_, index) => `asset-${index}`)));
    expect(gallery(accepted).items).toHaveLength(500);
    const bound = bindResultNodes(accepted, reserved.groups[1], "second"), original = structuredClone(bound);
    expect(() => reconcileResultNodes(bound, "producer", receipt("second", "completed", ["second-0", "second-1"]))).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(bound).toEqual(original);
    expect(gallery(bound).items.filter(item => item.state === "completed")).toHaveLength(499);
  });

  it("promotes up to 500 native outputs in place even when the graph already has 500 nodes", () => {
    const reserved = reserveResultNodes(graphAtNodeCount(499), "producer"), input = reserved.draft.nodes[499];
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "native");
    const completed = reconcileResultNodes(bound, "producer", receipt("native", "completed", Array.from({ length: 500 }, (_, index) => `asset-${index}`)));
    expect(completed.nodes).toHaveLength(500);
    expect(gallery(completed).node.id).toBe(input.id);
    expect(gallery(completed).items).toHaveLength(500);
    expect(completed.edges).toEqual([{ ...reserved.draft.edges[0], targetPortId: "image" }]);
  });

  it("retargets the existing Input wire in place without exceeding a full 2,000-edge graph", () => {
    const reserved = reserveResultNodes(graphAtEdgeCount(1_999, "generate.image"), "producer"), input = reserved.draft.nodes[2];
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "native");
    const completed = reconcileResultNodes(bound, "producer", receipt("native", "completed", ["one", "two"]));
    expect(completed.edges).toHaveLength(2_000);
    expect(completed.edges.slice(0, 1_999)).toEqual(reserved.draft.edges.slice(0, 1_999));
    expect(completed.edges[1_999]).toEqual({ ...reserved.draft.edges[1_999], targetPortId: "image" });
    expect(gallery(completed, input.id).items.map(item => item.assetId)).toEqual(["one", "two"]);
  });

  it.each(["node", "edge"] as const)("rejects an extra Gallery at the %s limit when a user wired the pending Input downstream", limit => {
    const base = limit === "node" ? graphAtNodeCount(498) : graphAtEdgeCount(1_998, "generate.image");
    base.nodes.push(node("resize", "edit.image.resize"));
    const reserved = reserveResultNodes(base, "producer"), input = reserved.draft.nodes.at(-1)!;
    const draft = { ...reserved.draft, edges: [...reserved.draft.edges, { id: "user-extraction", sourceNodeId: input.id,
      sourcePortId: "image", targetNodeId: "resize", targetPortId: "image", sortOrder: 0 }] };
    const bound = bindResultNodes(draft, reserved.groups[0], "native"), original = structuredClone(bound);
    expect(() => reconcileResultNodes(bound, "producer", receipt("native", "completed", ["one", "two"]))).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(bound).toEqual(original);
    expect(bound.nodes.find(item => item.id === input.id)?.kind).toBe("input.image");
  });

  it.each([false, true])("rejects more than 500 native slots without partial promotion (sparse bindings: %s)", sparse => {
    const reserved = reserveResultNodes(graph(), "producer");
    const bound = bindResultNodes(reserved.draft, reserved.groups[0], "oversized"), original = structuredClone(bound);
    const completed = sparse ? receipt("oversized", "completed", ["last"], [{ portId: "image", sortOrder: 500, assetId: "last" }])
      : receipt("oversized", "completed", Array.from({ length: 501 }, (_, index) => `asset-${index}`));
    expect(() => reconcileResultNodes(bound, "producer", completed)).toThrow("RESULT_NODE_LIMIT_EXCEEDED");
    expect(bound).toEqual(original);
    expect(bound.nodes[1].kind).toBe("input.image");
  });
});
