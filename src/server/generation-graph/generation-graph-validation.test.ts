import { describe, expect, it } from "vitest";

import type {
  GenerationGraphEdgeInput,
  GenerationGraphNodeInput,
} from "./generation-graph-contract";
import { validateGraphStructure } from "./generation-graph-validation";

function node(id: string): GenerationGraphNodeInput {
  return {
    id,
    type: "imageGeneration",
    position: { x: 0, y: 0 },
    configVersion: 1,
    config: { prompt: "", modelKey: null, parameters: {} },
    selectedOutputImageId: null,
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: "primary" | "reference" = "reference",
): GenerationGraphEdgeInput {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    kind,
    sourceHandle: null,
    targetHandle: null,
  };
}

describe("validateGraphStructure", () => {
  it("accepts a directed acyclic graph", () => {
    expect(
      validateGraphStructure({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("ab", "a", "b", "primary"), edge("ac", "a", "c")],
      }),
    ).toEqual([]);
  });

  it("reports duplicate node and edge ids once", () => {
    const issues = validateGraphStructure({
      nodes: [node("a"), node("a")],
      edges: [edge("e", "a", "a"), edge("e", "a", "a")],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_NODE_ID", nodeId: "a" }),
        expect.objectContaining({ code: "DUPLICATE_EDGE_ID", edgeId: "e" }),
      ]),
    );
  });

  it("reports a missing endpoint", () => {
    expect(validateGraphStructure({ nodes: [node("a")], edges: [edge("e", "a", "b")] })).toContainEqual({
      code: "EDGE_ENDPOINT_NOT_FOUND",
      edgeId: "e",
    });
  });

  it("reports a self edge and cycle", () => {
    expect(validateGraphStructure({ nodes: [node("a")], edges: [edge("e", "a", "a")] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SELF_EDGE", edgeId: "e" }),
        { code: "GRAPH_CYCLE" },
      ]),
    );
  });

  it("reports a multi-node cycle", () => {
    expect(
      validateGraphStructure({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")],
      }),
    ).toContainEqual({ code: "GRAPH_CYCLE" });
  });

  it("limits incoming primary edges to one", () => {
    expect(
      validateGraphStructure({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("ac", "a", "c", "primary"), edge("bc", "b", "c", "primary")],
      }),
    ).toContainEqual({
      code: "PRIMARY_INPUT_LIMIT_EXCEEDED",
      edgeId: "bc",
      nodeId: "c",
    });
  });

  it("reports duplicate edge identity independently of edge id", () => {
    expect(
      validateGraphStructure({
        nodes: [node("a"), node("b")],
        edges: [edge("e1", "a", "b"), edge("e2", "a", "b")],
      }),
    ).toContainEqual({ code: "DUPLICATE_EDGE", edgeId: "e2" });
  });
});
