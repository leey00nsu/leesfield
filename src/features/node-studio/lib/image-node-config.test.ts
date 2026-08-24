import { describe, expect, it } from "vitest";

import type { GenerationGraphFlowEdge, ImageGenerationFlowNode } from "../model/flow-types";
import {
  deleteImageNode,
  duplicateImageNode,
  replaceImageNodeConfig,
  replaceImageNodeSelectedOutput,
} from "./image-node-config";

const sourceNode: ImageGenerationFlowNode = {
  id: "node_a",
  type: "imageGeneration",
  position: { x: 10, y: 20 },
  selected: true,
  data: {
    configVersion: 1,
    config: {
      prompt: "source",
      modelKey: "model/a",
      parameters: { nested: { value: 1 }, images: ["a"] },
    },
    selectedOutputImageId: "output_1",
  },
};

describe("image node config mutations", () => {
  it("replaces persistent config without adding transient data", () => {
    const next = replaceImageNodeConfig([sourceNode], "node_a", {
      prompt: "updated",
      modelKey: null,
      parameters: { steps: 8 },
    });

    expect(next[0]?.data.config).toEqual({
      prompt: "updated",
      modelKey: null,
      parameters: { steps: 8 },
    });
    expect(next[0]?.data).not.toHaveProperty("onChange");
  });

  it("duplicates config deeply with a new id and resets output without edges", () => {
    const next = duplicateImageNode([sourceNode], "node_a", "node_b");
    const duplicate = next[1]!;

    expect(next[0]?.selected).toBe(false);
    expect(duplicate).toMatchObject({
      id: "node_b",
      position: { x: 58, y: 68 },
      selected: true,
      data: {
        config: sourceNode.data.config,
        selectedOutputImageId: null,
      },
    });
    expect(duplicate.data.config).not.toBe(sourceNode.data.config);
    expect(duplicate.data.config.parameters.nested).not.toBe(
      sourceNode.data.config.parameters.nested,
    );
  });

  it("replaces only the selected output relation", () => {
    const next = replaceImageNodeSelectedOutput(
      [sourceNode],
      "node_a",
      "output_2",
    );
    expect(next[0]?.data).toEqual({
      ...sourceNode.data,
      selectedOutputImageId: "output_2",
    });
    expect(next[0]?.data.config).toBe(sourceNode.data.config);
    expect(
      replaceImageNodeSelectedOutput(next, "node_a", "output_2"),
    ).toBe(next);
  });

  it("deletes connected edges together with the node", () => {
    const other = { ...sourceNode, id: "node_b" };
    const edges: GenerationGraphFlowEdge[] = [
      {
        id: "edge_a",
        source: "node_a",
        target: "node_b",
        data: { kind: "reference" },
      },
      {
        id: "edge_b",
        source: "node_b",
        target: "node_b",
        data: { kind: "reference" },
      },
    ];

    const next = deleteImageNode([sourceNode, other], edges, "node_a");

    expect(next.nodes.map((node) => node.id)).toEqual(["node_b"]);
    expect(next.edges.map((edge) => edge.id)).toEqual(["edge_b"]);
  });
});
