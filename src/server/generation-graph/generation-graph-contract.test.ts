import { describe, expect, it } from "vitest";

import {
  createGenerationGraphSchema,
  updateGenerationGraphSchema,
} from "./generation-graph-contract";

const validNode = {
  id: "node_1",
  type: "imageGeneration" as const,
  position: { x: 10, y: -2.5 },
  configVersion: 1 as const,
  config: { prompt: "a studio portrait", modelKey: null, parameters: {} },
  selectedOutputImageId: null,
};

describe("generation graph contract", () => {
  it("normalizes a graph title", () => {
    expect(createGenerationGraphSchema.parse({ title: "  Draft graph  " })).toEqual({
      title: "Draft graph",
    });
  });

  it("accepts an image generation v1 snapshot", () => {
    const result = updateGenerationGraphSchema.parse({
      expectedVersion: 1,
      title: "Graph",
      nodes: [validNode],
      edges: [],
    });

    expect(result.nodes[0]).toEqual(validNode);
  });

  it.each([
    ["unknown node type", { ...validNode, type: "videoGeneration" }],
    ["unknown config version", { ...validNode, configVersion: 2 }],
    ["extra config field", { ...validNode, config: { ...validNode.config, provider: "x" } }],
    ["non-finite position", { ...validNode, position: { x: Number.NaN, y: 0 } }],
  ])("rejects %s", (_label, node) => {
    expect(
      updateGenerationGraphSchema.safeParse({
        expectedVersion: 1,
        title: "Graph",
        nodes: [node],
        edges: [],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown snapshot fields", () => {
    expect(
      updateGenerationGraphSchema.safeParse({
        expectedVersion: 1,
        title: "Graph",
        nodes: [],
        edges: [],
        ownerEmail: "other@example.com",
      }).success,
    ).toBe(false);
  });
});
