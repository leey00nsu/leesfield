import { describe, expect, it } from "vitest";

import type { GraphStructureEdge } from "./graph-validation";
import { validateGraphStructure } from "./graph-validation";

const nodes = ["a", "b", "c"].map((id) => ({ id }));
const edge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind: "primary" | "reference" = "reference",
): GraphStructureEdge => ({
  id,
  sourceNodeId,
  targetNodeId,
  kind,
  sourceHandle: null,
  targetHandle: null,
});

describe("validateGraphStructure", () => {
  it("accepts a directed acyclic graph", () => {
    expect(
      validateGraphStructure({
        nodes,
        edges: [edge("ab", "a", "b", "primary"), edge("ac", "a", "c")],
      }),
    ).toEqual([]);
  });

  it("reports duplicate ids", () => {
    expect(
      validateGraphStructure({
        nodes: [{ id: "a" }, { id: "a" }],
        edges: [edge("e", "a", "a"), edge("e", "a", "a")],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_NODE_ID", nodeId: "a" }),
        expect.objectContaining({ code: "DUPLICATE_EDGE_ID", edgeId: "e" }),
      ]),
    );
  });

  it.each([
    ["EDGE_ENDPOINT_NOT_FOUND", [edge("e", "a", "missing")]],
    ["SELF_EDGE", [edge("e", "a", "a")]],
    ["GRAPH_CYCLE", [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")]],
    ["DUPLICATE_EDGE", [edge("e1", "a", "b"), edge("e2", "a", "b")]],
    [
      "PRIMARY_INPUT_LIMIT_EXCEEDED",
      [edge("ac", "a", "c", "primary"), edge("bc", "b", "c", "primary")],
    ],
  ])("reports %s", (code, edges) => {
    expect(validateGraphStructure({ nodes, edges })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });
});
