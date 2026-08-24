import {
  NodeInputInvalidError,
  NodeInputSelectionRequiredError,
} from "./node-generation-errors";
import {
  resolveNodeInputs,
  type NodeInputEdge,
} from "./node-input-resolution";

const ownerEmail = "owner@example.com";

function edge(
  overrides: Partial<NodeInputEdge> & Pick<NodeInputEdge, "id" | "sourceNodeId">,
): NodeInputEdge {
  const { id, sourceNodeId, ...rest } = overrides;
  const imageId = `image-${sourceNodeId}`;
  return {
    id,
    kind: "reference",
    createdAt: new Date("2026-08-24T10:00:00.000Z"),
    sourceNodeId,
    sourceNode: {
      id: sourceNodeId,
      selectedOutputImageId: imageId,
      selectedOutputImage: {
        id: imageId,
        url: `https://assets.example.com/${imageId}.png`,
        generation: {
          ownerEmail,
          graphNodeId: sourceNodeId,
          status: "completed",
        },
      },
    },
    ...rest,
  };
}

describe("resolveNodeInputs", () => {
  it("returns no inputs when the target has no incoming Edges", () => {
    expect(resolveNodeInputs(ownerEmail, [])).toEqual([]);
  });

  it("orders primary first and references by createdAt then Edge id", () => {
    const inputs = resolveNodeInputs(ownerEmail, [
      edge({
        id: "reference-b",
        sourceNodeId: "node-reference-b",
        createdAt: new Date("2026-08-24T10:00:01.000Z"),
      }),
      edge({
        id: "reference-a2",
        sourceNodeId: "node-reference-a2",
      }),
      edge({
        id: "primary",
        sourceNodeId: "node-primary",
        kind: "primary",
        createdAt: new Date("2026-08-24T10:00:02.000Z"),
      }),
      edge({
        id: "reference-a1",
        sourceNodeId: "node-reference-a1",
      }),
    ]);

    expect(inputs.map((input) => input.edgeId)).toEqual([
      "primary",
      "reference-a1",
      "reference-a2",
      "reference-b",
    ]);
  });

  it("deduplicates the same selected image while preserving its first role", () => {
    const primary = edge({
      id: "primary",
      sourceNodeId: "node-primary",
      kind: "primary",
    });
    const duplicate = edge({
      id: "reference",
      sourceNodeId: "node-primary",
    });

    expect(resolveNodeInputs(ownerEmail, [duplicate, primary])).toEqual([
      expect.objectContaining({ imageId: "image-node-primary", kind: "primary" }),
    ]);
  });

  it("requires a selected output for every connected source Node", () => {
    const input = edge({ id: "reference", sourceNodeId: "node-source" });
    input.sourceNode.selectedOutputImageId = null;
    input.sourceNode.selectedOutputImage = null;

    expect(() => resolveNodeInputs(ownerEmail, [input])).toThrow(
      NodeInputSelectionRequiredError,
    );
  });

  it.each([
    ["missing relation", (input: NodeInputEdge) => {
      input.sourceNode.selectedOutputImage = null;
    }],
    ["foreign owner", (input: NodeInputEdge) => {
      input.sourceNode.selectedOutputImage!.generation.ownerEmail = "other@example.com";
    }],
    ["wrong source Node", (input: NodeInputEdge) => {
      input.sourceNode.selectedOutputImage!.generation.graphNodeId = "node-other";
    }],
    ["non-completed Generation", (input: NodeInputEdge) => {
      input.sourceNode.selectedOutputImage!.generation.status = "processing";
    }],
  ])("rejects an invalid selected output: %s", (_label, mutate) => {
    const input = edge({ id: "reference", sourceNodeId: "node-source" });
    mutate(input);
    expect(() => resolveNodeInputs(ownerEmail, [input])).toThrow(
      NodeInputInvalidError,
    );
  });
});
