// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CanonicalEdge, CanonicalJsonValue, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { GeneratedResultGalleryItem } from "@/shared/generation-graph/node-registry";
import { SpaceInputResolver, type SpaceInputGraph } from "./space-editor-inputs";

const node = (id: string, kind: string, config: CanonicalJsonValue = {}): CanonicalNode => ({ id, kind, config, configVersion: 1,
  position: { x: 0, y: 0 }, selectedOutputAssetId: null });
const edge = (id: string, sourceNodeId: string, targetNodeId: string, sourcePortId = "text", targetPortId = "prompt", sortOrder = 0): CanonicalEdge =>
  ({ id, sourceNodeId, targetNodeId, sourcePortId, targetPortId, sortOrder });
const resultItem = (id: string, patch: Partial<GeneratedResultGalleryItem> = {}): GeneratedResultGalleryItem =>
  ({ id, nodeId: "producer", executionId: "accepted-old", portId: "image", index: 0, state: "completed", mediaType: "image", assetId: "old-result", ...patch });

describe("canonical Space input resolver", () => {
  it("keeps connected empty text authoritative, including an Assistant item's distinct output", () => {
    const graph = { nodes: [node("a", "generate.assistant"), node("p", "input.prompt", { text: "local", variableName: "idea" }),
      node("c", "process.promptConstructor", { template: "Use @idea" }), node("g", "generate.image")],
      edges: [edge("a-p", "a", "p", "item", "text"), edge("p-c", "p", "c", "text", "text"), edge("c-g", "c", "g")] };
    const resolver = new SpaceInputResolver(graph, { assistantResults: { a: { text: "whole response", item: "scarf" } } });
    expect(resolver.promptInput("g")).toEqual({ connected: true, text: "Use scarf" });
    resolver.updateGraph(graph, { assistantResults: { a: { text: "whole response", item: "" } } });
    expect(resolver.promptInput("p")).toEqual({ connected: true, text: "" });
    expect(resolver.promptInput("g").text).toBe("Use ");
    resolver.updateGraph({ ...graph, edges: graph.edges.filter(item => item.id !== "a-p") });
    expect(resolver.promptInput("g").text).toBe("Use local");
  });

  it("preserves context-specific pause rules rather than removing all paused edges", () => {
    const graph: SpaceInputGraph = { nodes: [node("source", "input.prompt", { text: "upstream" }),
      node("relay", "input.prompt", { text: "local", variableName: "v" }),
      node("c", "process.promptConstructor", { template: "@v" }), node("target", "generate.image")],
      edges: [{ ...edge("pass", "source", "relay", "text", "text"), hasPause: true },
        edge("variable", "relay", "c", "text", "text"), edge("use", "c", "target")] };
    const resolver = new SpaceInputResolver(graph);
    expect(resolver.promptInput("relay")).toEqual({ connected: false, text: null });
    expect(resolver.promptInput("target").text).toBe("upstream"); // shared Prompt relay resolver ignores this pause.
    resolver.updateGraph({ ...graph, edges: graph.edges.map(item => item.id === "variable" ? { ...item, hasPause: true } : item) });
    expect(resolver.promptInput("target").text).toBe("@v"); // Constructor excludes paused variable inputs.
  });

  it("resolves media forwarding and restores the retained local input after disconnect", () => {
    const source = { ...node("source", "generate.image"), selectedOutputAssetId: "generated" };
    const relay = node("relay", "input.image", { assetId: "local" });
    const graph = { nodes: [source, relay, node("resize", "edit.image.resize")],
      edges: [edge("pass", "source", "relay", "image", "reference"), edge("use", "relay", "resize", "image", "image")] };
    const resolver = new SpaceInputResolver(graph);
    expect(resolver.inputAssetId("resize", "image")).toBe("generated");
    resolver.updateGraph({ ...graph, edges: [graph.edges[1]] });
    expect(resolver.inputAssetId("resize", "image")).toBe("local");
    expect(relay.config).toEqual({ assetId: "local" });
  });

  it("pins an automatic result to its own execution asset even when the producer selection changes", () => {
    const source = { ...node("source", "generate.image"), selectedOutputAssetId: "new-result" };
    const result = node("result", "input.image", { assetId: "old-result", resultSource: {
      nodeId: "source", executionId: "accepted-old", portId: "image", index: 1, state: "completed" } });
    const graph = { nodes: [source, result, node("target", "edit.image.resize")],
      edges: [edge("result", "source", "result", "image", "reference"), edge("use", "result", "target", "image", "image")] };
    const resolver = new SpaceInputResolver(graph);
    expect(resolver.inputAssetId("target", "image")).toBe("old-result");
    resolver.updateGraph({ ...graph, nodes: graph.nodes.map(item => item.id === "result" ? { ...item,
      config: { assetId: null, resultSource: { nodeId: "source", executionId: "accepted-old", portId: "image", index: 1, state: "pending" } } } : item) });
    expect(resolver.inputAssetId("target", "image")).toBeNull();
  });

  it("keeps start/end bindings separate and never substitutes a representative frame", () => {
    const source = { ...node("frames", "edit.video.extractFrames"), selectedOutputAssetId: "start" };
    const graph = { nodes: [source, node("relay", "input.image", { assetId: "local" }), node("target", "edit.image.resize")],
      edges: [edge("frame", "frames", "relay", "endFrame", "reference"), edge("use", "relay", "target", "image", "image")] };
    const outputs = new Map([["frames", [{ portId: "startFrame", assetId: "start", sortOrder: 0 }, { portId: "endFrame", assetId: "end", sortOrder: 0 }]]]);
    const resolver = new SpaceInputResolver(graph, { mediaOutputs: outputs });
    expect(resolver.inputAssetId("target", "image")).toBe("end");
    resolver.updateGraph(graph, { mediaOutputs: new Map([["frames", outputs.get("frames")!.slice(0, 1)]]) });
    expect(resolver.inputAssetId("target", "image")).toBeNull();
    expect(resolver.sourceAssetIds("frames", "startFrame")).toEqual(["start"]);
  });

  it("keeps Gallery results and duplicates frozen across newer producer selections, detached edges and deleted producers", () => {
    const producer = { ...node("producer", "generate.image"), selectedOutputAssetId: "latest-result" };
    const gallery = node("gallery", "output.gallery", { mediaType: null, resultItems: [resultItem("first"), resultItem("duplicate", { index: 1 }),
      resultItem("pending", { executionId: "new-run", state: "pending", assetId: null })] });
    const manual = node("manual", "input.image", { assetId: "manual-asset" });
    const graph = { nodes: [producer, gallery, manual], edges: [edge("producer", "producer", "gallery", "image", "image"),
      edge("manual", "manual", "gallery", "image", "image", 1)] };
    const resolver = new SpaceInputResolver(graph);
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-result", "old-result", "manual-asset"]);
    resolver.updateGraph({ ...graph, nodes: [{ ...producer, selectedOutputAssetId: "newest-result" }, gallery, manual] },
      { mediaOutputs: new Map([["producer", [{ portId: "image", assetId: "newest-result", sortOrder: 0 }]]]) });
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-result", "old-result", "manual-asset"]);
    resolver.updateGraph({ ...graph, edges: [graph.edges[1]] });
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-result", "old-result", "manual-asset"]);
    resolver.updateGraph({ nodes: [gallery, manual], edges: [graph.edges[1]] });
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-result", "old-result", "manual-asset"]);
    expect(gallery.config).toMatchObject({ resultItems: [expect.objectContaining({ assetId: "old-result" }), expect.objectContaining({ assetId: "old-result" }),
      expect.objectContaining({ state: "pending", assetId: null })] });
  });

  it("uses completed Gallery snapshots by media type and suppresses exact represented ports in every slot state", () => {
    const gallery = node("gallery", "output.gallery", { mediaType: null, resultItems: [
      resultItem("start", { portId: "startFrame", assetId: "old-start" }),
      resultItem("pending", { nodeId: "pending-producer", state: "pending", assetId: null }),
      resultItem("failed", { nodeId: "failed-producer", state: "failed", assetId: "unusable" }),
      resultItem("cancelled", { nodeId: "cancelled-producer", state: "cancelled", assetId: null }),
      resultItem("audio", { nodeId: "deleted", portId: "audio", mediaType: "audio", assetId: "old-audio" }),
    ] });
    const graph = { nodes: [gallery, node("producer", "edit.video.extractFrames"),
      ...["pending", "failed", "cancelled"].map(state => ({ ...node(`${state}-producer`, "generate.image"), selectedOutputAssetId: `${state}-latest` })),
      node("manual", "input.image", { assetId: "paused-manual" })], edges: [
      { ...edge("start", "producer", "gallery", "startFrame", "image"), hasPause: true },
      edge("end", "producer", "gallery", "endFrame", "image"),
      ...["pending", "failed", "cancelled"].map(state => edge(state, `${state}-producer`, "gallery", "image", "image")),
      { ...edge("manual", "manual", "gallery", "image", "image"), hasPause: true },
    ] };
    const resolver = new SpaceInputResolver(graph, { mediaOutputs: new Map([["producer", [
      { portId: "startFrame", assetId: "latest-start", sortOrder: 0 }, { portId: "endFrame", assetId: "latest-end", sortOrder: 0 },
    ]]]) });
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-start", "latest-end"]);
    expect(resolver.inputAssetIds("gallery", "audio")).toEqual(["old-audio"]);
    expect(resolver.inputAssetIds("gallery", "video")).toEqual([]);
  });

  it("invalidates Gallery inputs on snapshot reconciliation while preserving caches for movement and unrelated inputs", () => {
    const gallery = node("gallery", "output.gallery", { mediaType: null, resultItems: [resultItem("first", { state: "pending", assetId: null })] });
    const graph = { nodes: [gallery, node("manual", "input.audio", { assetId: "local" }), node("other", "output.gallery", { mediaType: null })],
      edges: [edge("manual", "manual", "other", "audio", "audio")] };
    const resolver = new SpaceInputResolver(graph), waiting = resolver.inputAssetIds("gallery", "image"), other = resolver.inputAssetIds("other", "audio");
    expect(waiting).toEqual([]);
    expect(resolver.updateGraph({ ...graph, nodes: graph.nodes.map(item => ({ ...item, position: { x: 100, y: 200 } })) })).toEqual(new Set());
    expect(resolver.inputAssetIds("gallery", "image")).toBe(waiting);
    const revision = resolver.inputRevision("gallery");
    expect(resolver.updateGraph({ ...graph, nodes: graph.nodes.map(item => item.id === "gallery" ? { ...item,
      config: { mediaType: null, resultItems: [resultItem("first")] } } : item) })).toEqual(new Set(["gallery"]));
    expect(resolver.inputAssetIds("gallery", "image")).toEqual(["old-result"]);
    expect(resolver.inputRevision("gallery")).toBe(revision + 1);
    expect(resolver.inputAssetIds("other", "audio")).toBe(other);
  });

  it("preserves explicit sparse/trailing null file slots and ordering", () => {
    const graph = { nodes: [node("first", "input.audio", { assetId: "a" }), node("last", "input.audio", { assetId: "c" }),
      node("target", "generate.video", { parameters: { dynamicParams: { tracks: [null, null, null, null] } } })],
      edges: [edge("last", "last", "target", "audio", "audio-field-tracks", 2), edge("first", "first", "target", "audio", "audio-field-tracks", 0)] };
    const resolver = new SpaceInputResolver(graph);
    expect(resolver.inputAssetSlots("target", "audio-field-tracks")).toEqual(["a", null, "c", null]);
    expect(resolver.inputAssetIds("target", "audio-field-tracks")).toEqual(["a", "c"]);
    expect(graph.edges.map(item => item.id)).toEqual(["last", "first"]);
  });

  it("retains cached inputs across movement and invalidates only changed source/downstream values", () => {
    const graph = { nodes: [node("p", "input.prompt", { text: "one" }), node("g", "generate.image"),
      node("q", "input.prompt", { text: "other" }), node("h", "generate.image")],
      edges: [edge("a", "p", "g"), edge("b", "q", "h")] };
    const resolver = new SpaceInputResolver(graph);
    const beforeG = resolver.promptInput("g"), beforeH = resolver.promptInput("h");
    const moved = { ...graph, nodes: graph.nodes.map(item => item.id === "p" ? { ...item, position: { x: 200, y: 100 } } : item) };
    expect([...resolver.updateGraph(moved)]).toEqual([]);
    expect(resolver.promptInput("g")).toBe(beforeG);
    expect(resolver.promptInput("h")).toBe(beforeH);
    expect(resolver.updateGraph({ ...moved, nodes: moved.nodes.map(item => item.id === "p" ? { ...item, config: { text: "two" } } : item) })).toEqual(new Set(["p", "g"]));
    expect(resolver.promptInput("g")).toEqual({ connected: true, text: "two" });
    expect(resolver.promptInput("h")).toBe(beforeH);
  });

  it("handles external IDs safely, missing sources and cycles without mutating saved data", () => {
    const graph = { nodes: [node("__proto__", "input.image", { assetId: "asset" }), node("constructor", "edit.image.resize")],
      edges: [edge("toString", "__proto__", "constructor", "image", "image")] };
    expect(new SpaceInputResolver(graph).inputAssetId("constructor", "image")).toBe("asset");
    const cycle = { nodes: [node("a", "input.video"), node("b", "input.video")],
      edges: [edge("a-b", "a", "b", "video", "video"), edge("b-a", "b", "a", "video", "video")] };
    expect(new SpaceInputResolver(cycle).inputAssetId("a", "video")).toBeNull();
    expect(new SpaceInputResolver({ nodes: [], edges: graph.edges }).inputAssetId("constructor", "image")).toBeNull();
  });

  it("keeps retained Split cell assets instead of forwarding a collection through its Ref", () => {
    const graph = { nodes: [{ ...node("split", "edit.image.splitGrid"), selectedOutputAssetId: "whole" },
      node("cell", "input.image", { assetId: "cell-asset" }), node("target", "edit.image.resize")],
      edges: [edge("reference", "split", "cell", "images", "reference"), edge("use", "cell", "target", "image", "image")] };
    expect(new SpaceInputResolver(graph).inputAssetId("target", "image")).toBe("cell-asset");
  });

  it("reuses unchanged output arrays when queries return equivalent binding objects", () => {
    const bindings = [{ graphNodeId: "frames", portId: "endFrame", assetId: "end", sortOrder: 0 }];
    const first = SpaceInputResolver.outputMap(bindings);
    const next = SpaceInputResolver.outputMap(bindings.map(item => ({ ...item })), first);
    expect(next.get("frames")).toBe(first.get("frames"));
    expect(SpaceInputResolver.outputMap([], first).has("frames")).toBe(false);
  });
});
