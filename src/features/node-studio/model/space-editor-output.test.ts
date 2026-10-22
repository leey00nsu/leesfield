import type { CanonicalNode, CanonicalEdge } from "@/shared/generation-graph/canonical-graph";
import { SpaceInputResolver } from "./space-editor-inputs";
import { selectedSpaceMediaAssetIds, spaceOutputConnection, spaceOutputSource } from "./space-editor-output";
import type { SpaceEditorDocument } from "./space-editor-types";
const node = (id: string, kind: string, config: CanonicalNode["config"] = {}, selectedOutputAssetId: string | null = null): CanonicalNode => ({ id, kind, configVersion: 1, position: { x: 0, y: 0 }, config, selectedOutputAssetId });
const edge = (id: string, sourceNodeId: string, targetNodeId: string, type = "image", targetPortId = type): CanonicalEdge => ({ id, sourceNodeId, sourcePortId: type, targetNodeId, targetPortId, sortOrder: 0 });
const doc = (nodes: CanonicalNode[], edges: CanonicalEdge[] = []): SpaceEditorDocument => ({ schemaVersion: 3, title: "Output", groups: [], nodes, edges });

it("honors explicit media choice without falling back to another connected type", () => {
  const output = node("output", "output.single", { mediaType: "video" }), graph = doc([node("image", "input.image", { assetId: "a" }), output], [edge("e", "image", "output")]);
  const inputs = new SpaceInputResolver(graph);
  expect(spaceOutputSource(output, inputs)).toBeNull();
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["output"])).toEqual([]);
});
it("exports only the currently visible audio/video/image priority, keeping hidden inputs out of the ZIP", () => {
  const output = node("output", "output.single"), graph = doc([node("image", "input.image", { assetId: "a" }), node("video", "input.video", { assetId: "v" }), node("audio", "input.audio", { assetId: "s" }), output], [edge("i", "image", "output"), edge("v", "video", "output", "video"), edge("s", "audio", "output", "audio")]);
  const inputs = new SpaceInputResolver(graph); expect(spaceOutputSource(output, inputs)).toEqual({ type: "audio", assetId: "s" });
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["output"])).toEqual(["s"]);
  const noAudio = { ...graph, edges: graph.edges.filter(item => item.id !== "s") }; inputs.updateGraph(noAudio);
  expect(spaceOutputSource(output, inputs)).toEqual({ type: "video", assetId: "v" });
  expect(selectedSpaceMediaAssetIds(noAudio, inputs, ["output"])).toEqual(["v"]);
  inputs.updateGraph({ ...graph, edges: graph.edges.filter(item => item.id === "i") });
  expect(spaceOutputSource(output, inputs)).toEqual({ type: "image", assetId: "a" });
});
it("identifies the visible wire after empty and paused higher-priority inputs", () => {
  const output = node("output", "output.single", { mediaType: null });
  const graph = doc([node("image", "input.image", { assetId: "i" }), node("video", "input.video", { assetId: "v" }), node("audio", "generate.audio"), output],
    [edge("audio-wire", "audio", "output", "audio"), edge("image-wire", "image", "output"), edge("video-wire", "video", "output", "video")]);
  const inputs = new SpaceInputResolver(graph);
  expect(spaceOutputConnection(output, inputs)).toEqual({ type: "video", assetId: "v", edgeId: "video-wire" });
  inputs.updateGraph({ ...graph, edges: graph.edges.map(item => item.id === "video-wire" ? { ...item, hasPause: true } : item) });
  expect(spaceOutputConnection(output, inputs)).toEqual({ type: "image", assetId: "i", edgeId: "image-wire" });
  inputs.updateGraph({ ...graph, nodes: graph.nodes.map(item => item.id === "audio" ? { ...item, selectedOutputAssetId: "a" } : item) });
  expect(spaceOutputConnection(output, inputs)).toEqual({ type: "audio", assetId: "a", edgeId: "audio-wire" });
});
it("resolves the connected frame port instead of the producer representative or another output", () => {
  const output = node("output", "output.single", { mediaType: "image" }), sibling = node("sibling", "output.single", { mediaType: "image" });
  const graph = doc([node("frames", "edit.video.extractFrames", {}, "start"), output, sibling],
    [{ ...edge("end-wire", "frames", "output"), sourcePortId: "endFrame" }, { ...edge("start-wire", "frames", "sibling"), sourcePortId: "startFrame" }]);
  const bindings = new Map([["frames", [{ portId: "startFrame", assetId: "start", sortOrder: 0 }, { portId: "endFrame", assetId: "end", sortOrder: 0 }]]]);
  const inputs = new SpaceInputResolver(graph, { mediaOutputs: bindings });
  expect(spaceOutputConnection(output, inputs)).toEqual({ type: "image", assetId: "end", edgeId: "end-wire" });
  expect(spaceOutputConnection(sibling, inputs)).toEqual({ type: "image", assetId: "start", edgeId: "start-wire" });
  inputs.updateGraph(graph, { mediaOutputs: new Map([["frames", bindings.get("frames")!.slice(0, 1)]]) });
  expect(spaceOutputConnection(output, inputs)).toBeNull();
  expect(spaceOutputConnection(sibling, inputs)?.edgeId).toBe("start-wire");
});
it("retains graph order and duplicates for previously eligible image ZIP kinds", () => {
  const graph = doc([node("in", "input.image", { assetId: "a" }), node("gen", "generate.image", {}, "b"), node("resize", "edit.image.resize", {}, "r"), node("old", "edit.image.annotation", {}, "c"), node("out", "output.single")], [edge("e", "in", "out")]);
  const inputs = new SpaceInputResolver(graph);
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["out", "old", "resize", "gen", "in"])).toEqual(["a", "b", "c", "a"]);
});
it("preserves connected-empty precedence, paused local restoration and retained Split references", () => {
  const graph = doc([node("source", "generate.image"), node("input", "input.image", { assetId: "hidden" })], [edge("ref", "source", "input", "image", "reference")]);
  const inputs = new SpaceInputResolver(graph);
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["input"])).toEqual([]);
  inputs.updateGraph({ ...graph, edges: [{ ...graph.edges[0], hasPause: true }] });
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["input"])).toEqual(["hidden"]);
  inputs.updateGraph({ ...graph, nodes: [{ ...graph.nodes[0], kind: "edit.image.splitGrid" }, graph.nodes[1]] });
  expect(selectedSpaceMediaAssetIds(graph, inputs, ["input"])).toEqual(["hidden"]);
});
it("exports execution-bound result Input media even when its producer representative changes", () => {
  const graph = doc([node("source", "generate.image", { prompt: "", modelKey: null, parameters: {} }, "new"), node("input", "input.image", { assetId: "fixed", resultSource: { nodeId: "source", executionId: "old", portId: "image", index: 0, state: "completed" } })], [edge("ref", "source", "input", "image", "reference")]);
  expect(selectedSpaceMediaAssetIds(graph, new SpaceInputResolver(graph), ["input"])).toEqual(["fixed"]);
});

it.each(["audio", "video"])("exports %s Inputs, Generations and bound result Inputs in graph order", type => {
  const graph = doc([node("in", `input.${type}`, { assetId: "original" }), node("gen", `generate.${type}`, {}, "new"),
    node("fixed", `input.${type}`, { assetId: "old", resultSource: { nodeId: "gen", executionId: "run", portId: type, index: 0, state: "completed" } })],
  [edge("result", "gen", "fixed", type)]);
  expect(selectedSpaceMediaAssetIds(graph, new SpaceInputResolver(graph), ["fixed", "in", "gen"])).toEqual(["original", "new", "old"]);
});

it("exports visible Gallery snapshots and manual media in display order with duplicates, excluding hidden and unfinished slots", () => {
  const slot = (id: string, state: string, mediaType = "audio", assetId: string | null = "snapshot") =>
    ({ id, nodeId: "producer", executionId: "run", portId: mediaType, index: 0, state, mediaType, assetId });
  const gallery = node("gallery", "output.gallery", { mediaType: null, excludedAssetIds: ["hidden"],
    excludedOccurrences: [{ edgeId: "v2", assetId: "video", occurrence: 0 }],
    resultItems: [slot("done", "completed"), slot("pending", "pending", "video", null), slot("failed", "failed", "audio", null),
      slot("cancel", "cancelled", "image", null), slot("hidden", "completed", "image", "hidden"), slot("duplicate", "completed")] });
  const graph = doc([node("audio", "input.audio", { assetId: "audio" }), node("video", "input.video", { assetId: "video" }),
    node("image", "input.image", { assetId: "image" }), node("producer", "generate.audio", {}, "newest"), gallery], [
    edge("a", "audio", "gallery", "audio"), edge("v1", "video", "gallery", "video"), edge("v2", "video", "gallery", "video"),
    { ...edge("paused", "video", "gallery", "video"), hasPause: true }, edge("i", "image", "gallery"), edge("producer-wire", "producer", "gallery", "audio"),
  ]);
  const before = JSON.stringify(graph);
  expect(selectedSpaceMediaAssetIds(graph, new SpaceInputResolver(graph), ["gallery"])).toEqual(["snapshot", "snapshot", "image", "video", "audio"]);
  expect(JSON.stringify(graph)).toBe(before);
});

it("exports four identical Gallery video occurrences and combines selected nodes in document order", () => {
  const graph = doc([node("video", "input.video", { assetId: "same" }), node("gallery", "output.gallery", { mediaType: "video" }), node("audio", "input.audio", { assetId: "sound" })],
    Array.from({ length: 4 }, (_, index) => ({ ...edge(`v${index}`, "video", "gallery", "video"), sortOrder: index })));
  expect(selectedSpaceMediaAssetIds(graph, new SpaceInputResolver(graph), ["gallery"])).toEqual(Array(4).fill("same"));
  expect(selectedSpaceMediaAssetIds(graph, new SpaceInputResolver(graph), ["audio", "gallery", "video"])).toEqual([...Array(5).fill("same"), "sound"]);
});
