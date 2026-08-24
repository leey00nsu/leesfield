import { describe, expect, it } from "vitest";

import { createImageGenerationFlowNode } from "./graph-adapter";
import { validateFlowConnection } from "./connection-validation";

const nodes = [
  createImageGenerationFlowNode("a", { x: 0, y: 0 }),
  createImageGenerationFlowNode("b", { x: 100, y: 0 }),
  createImageGenerationFlowNode("c", { x: 200, y: 0 }),
];
const connection = (source: string, target: string, targetHandle = "reference") => ({
  source,
  target,
  sourceHandle: "output",
  targetHandle,
});

describe("validateFlowConnection", () => {
  it("derives reference and primary kinds from target handles", () => {
    expect(validateFlowConnection(nodes, [], connection("a", "b")).kind).toBe("reference");
    expect(validateFlowConnection(nodes, [], connection("a", "b", "primary")).kind).toBe(
      "primary",
    );
  });

  it("rejects a self edge", () => {
    expect(validateFlowConnection(nodes, [], connection("a", "a")).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "SELF_EDGE" })]),
    );
  });

  it("rejects a cycle", () => {
    const edges = [
      { id: "ab", source: "a", target: "b", data: { kind: "reference" as const } },
      { id: "bc", source: "b", target: "c", data: { kind: "reference" as const } },
    ];
    expect(validateFlowConnection(nodes, edges, connection("c", "a")).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "GRAPH_CYCLE" })]),
    );
  });

  it("rejects a second incoming primary but accepts references", () => {
    const edges = [
      { id: "ac", source: "a", target: "c", data: { kind: "primary" as const } },
    ];
    expect(validateFlowConnection(nodes, edges, connection("b", "c", "primary")).valid).toBe(
      false,
    );
    expect(validateFlowConnection(nodes, edges, connection("b", "c", "reference")).valid).toBe(
      true,
    );
  });
});
