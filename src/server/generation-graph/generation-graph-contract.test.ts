import { describe, expect, it } from "vitest";

import {
  createGenerationGraphSchema,
  updateGenerationGraphSchema,
} from "./generation-graph-contract";

const validNode = {
  id: "node_1",
  kind: "generate.image",
  position: { x: 10, y: -2.5 },
  configVersion: 1,
  config: { prompt: "a studio portrait", modelKey: null, parameters: {} },
  selectedOutputAssetId: null,
};

const validSnapshot = {
  schemaVersion: 3 as const, groups: [],
  expectedVersion: 1,
  title: "Graph",
  nodes: [validNode],
  edges: [],
};

describe("generation graph contract", () => {
  it("normalizes a graph title", () => {
    expect(createGenerationGraphSchema.parse({ title: "  Draft graph  " })).toEqual({
      title: "Draft graph",
    });
  });

  it("accepts only the strict canonical v2 snapshot", () => {
    expect(updateGenerationGraphSchema.parse(validSnapshot)).toEqual(validSnapshot);
  });

  it.each([
    ["old v2 writer", { ...validSnapshot, schemaVersion: 2 }],
    ["omitted groups", { ...validSnapshot, groups: undefined }],
    ["v1 schema", { ...validSnapshot, schemaVersion: 1 }],
    ["writer compatibility field", { ...validSnapshot, writerVersion: 2 }],
    ["legacy node type", { ...validSnapshot, nodes: [{ ...validNode, type: "imageGeneration" }] }],
    ["legacy selected image", { ...validSnapshot, nodes: [{ ...validNode, selectedOutputImageId: null }] }],
    ["non-finite position", { ...validSnapshot, nodes: [{ ...validNode, position: { x: Number.NaN, y: 0 } }] }],
    ["unknown snapshot field", { ...validSnapshot, ownerEmail: "other@example.com" }],
  ])("rejects %s", (_label, snapshot) => {
    expect(updateGenerationGraphSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects duplicate group ownership and members from another Space", () => {
    const group = { id: "group", title: "Frame", color: "neutral", locked: false,
      bounds: { x: 0, y: 0, width: 500, height: 500 }, memberNodeIds: [validNode.id] };
    expect(updateGenerationGraphSchema.safeParse({ ...validSnapshot, groups: [group] }).success).toBe(true);
    for (const groups of [[group, { ...group, id: "other" }], [{ ...group, memberNodeIds: ["foreign"] }]]) {
      expect(updateGenerationGraphSchema.safeParse({ ...validSnapshot, groups }).success).toBe(false);
    }
  });
});
