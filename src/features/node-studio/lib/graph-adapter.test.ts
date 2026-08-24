import { describe, expect, it } from "vitest";

import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import {
  createImageGenerationFlowNode,
  flowToUpdateGraph,
  graphSnapshotToFlow,
} from "./graph-adapter";

const graph: GenerationGraphSnapshotDto = {
  id: "graph_1",
  title: "Graph",
  version: 3,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  nodes: [
    {
      id: "node_1",
      type: "imageGeneration",
      position: { x: 10, y: 20 },
      configVersion: 1,
      config: { prompt: "hello", modelKey: null, parameters: { steps: 8 } },
      selectedOutputImageId: null,
    },
  ],
  edges: [
    {
      id: "edge_1",
      sourceNodeId: "node_1",
      targetNodeId: "node_1",
      kind: "reference",
      sourceHandle: "output",
      targetHandle: "reference",
    },
  ],
};

describe("graph adapter", () => {
  it("round-trips persistent graph fields", () => {
    const flow = graphSnapshotToFlow(graph);
    flow.nodes[0].selected = true;
    flow.nodes[0].measured = { width: 240, height: 160 };

    const update = flowToUpdateGraph(graph.title, graph.version, flow.nodes, flow.edges);

    expect(update).toEqual({
      title: graph.title,
      expectedVersion: 3,
      nodes: graph.nodes,
      edges: graph.edges,
    });
    expect(update.nodes[0]).not.toHaveProperty("selected");
    expect(update.nodes[0]).not.toHaveProperty("measured");
  });

  it("creates an empty image generation v1 node", () => {
    expect(createImageGenerationFlowNode("node_new", { x: 4, y: 5 })).toMatchObject({
      id: "node_new",
      type: "imageGeneration",
      position: { x: 4, y: 5 },
      data: {
        configVersion: 1,
        config: { prompt: "", modelKey: null, parameters: {} },
        selectedOutputImageId: null,
      },
    });
  });
});
