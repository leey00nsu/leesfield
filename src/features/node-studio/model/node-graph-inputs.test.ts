import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";

import { resolveNodeInputAssetId, resolveNodePromptInput } from "./node-graph-inputs";

const graph: NodeBananaRuntimeGraph = {
  nodes: [
    { id: "prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "connected prompt" } } },
    { id: "image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "asset-input" } } },
    { id: "generated", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {}, selectedOutputAssetId: "asset-output" } },
    { id: "target", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {} } },
    { id: "annotation", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "edit.image.annotation", config: {} } },
  ],
  edges: [
    { id: "prompt-edge", source: "prompt", target: "target", sourceHandle: "text", targetHandle: "text", data: { targetPortId: "prompt" } },
    { id: "image-edge", source: "generated", target: "annotation", sourceHandle: "image", targetHandle: "image", data: { targetPortId: "image" } },
  ],
};

describe("Node graph input resolution", () => {
  it("resolves Constructor named and inline variables once, including pause, disconnect and cycle", () => {
    const makeNode = (id: string, kind: string, config: Record<string, unknown>) => ({ id, type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: kind, config } });
    const connect = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, sourceHandle: "text", targetHandle: "text", data: { targetPortId: "text", hasPause: false } });
    const composed = {
      nodes: [makeNode("named", "input.prompt", { variableName: "cat", text: "@other" }),
        makeNode("inline", "input.prompt", { text: '<var="cat">ignored</var><var="cat_long">fox</var>' }),
        makeNode("constructor", "process.promptConstructor", { template: "@cat / @cat_long / @missing" }),
        makeNode("consumer", "generate.image", {})],
      edges: [connect("named", "constructor"), connect("inline", "constructor"), connect("constructor", "consumer")],
    };
    expect(resolveNodePromptInput(composed, "consumer").text).toBe("@other / fox / @missing");
    composed.edges[0].data.hasPause = true;
    expect(resolveNodePromptInput(composed, "consumer").text).toBe("ignored / fox / @missing");
    expect(resolveNodePromptInput({ ...composed, edges: [composed.edges[2]] }, "consumer").text).toBe("@cat / @cat_long / @missing");
    composed.edges.push(connect("constructor", "inline"));
    expect(resolveNodePromptInput(composed, "consumer").text).toBeNull();
  });
  it("resolves only a connected Prompt node as the effective generation prompt", () => {
    expect(resolveNodePromptInput(graph, "target")).toEqual({ connected: true, text: "connected prompt" });
    expect(resolveNodePromptInput({ ...graph, edges: [] }, "target")).toEqual({ connected: false, text: null });
  });

  it("uses a producer's selected durable output asset for visual operation editors", () => {
    expect(resolveNodeInputAssetId(graph, "annotation", "image")).toBe("asset-output");
    const inputGraph = { ...graph, edges: [{ id: "input-edge", source: "image", target: "annotation", targetHandle: "image" }] };
    expect(resolveNodeInputAssetId(inputGraph, "annotation", "image")).toBe("asset-input");
  });

  it.each(["input.image", "edit.image.splitGrid"])("resolves references from %s with Split cells retaining their slice", (sourceKind) => {
    const chained: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "root-image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: sourceKind, config: { assetId: "asset-root" }, selectedOutputAssetId: "asset-root" } },
        { id: "relay-image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "asset-local-preserved" } } },
        { id: "target", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "edit.image.resize", config: {} } },
        { id: "root-prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "root text" } } },
        { id: "relay-prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "local text" } } },
        { id: "generation", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {} } },
      ],
      edges: [
        { id: "image-pass", source: "root-image", target: "relay-image", sourceHandle: "image", targetHandle: "reference", data: { targetPortId: "reference" } },
        { id: "image-use", source: "relay-image", target: "target", sourceHandle: "image", targetHandle: "image", data: { targetPortId: "image" } },
        { id: "prompt-pass", source: "root-prompt", target: "relay-prompt", sourceHandle: "text", targetHandle: "text", data: { targetPortId: "text" } },
        { id: "prompt-use", source: "relay-prompt", target: "generation", sourceHandle: "text", targetHandle: "prompt", data: { targetPortId: "prompt" } },
      ],
    };

    expect(resolveNodeInputAssetId(chained, "target", "image")).toBe(sourceKind === "input.image" ? "asset-root" : "asset-local-preserved");
    expect(resolveNodePromptInput(chained, "generation")).toEqual({ connected: true, text: "root text" });
  });
});
