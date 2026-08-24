import { describe, expect, it } from "vitest";

import type {
  GenerationGraphFlowEdge,
  ImageGenerationFlowNode,
} from "./flow-types";
import { resolveImageNodeInputReadiness } from "./node-input-readiness";

function node(id: string, selectedOutputImageId: string | null) {
  return {
    id,
    type: "imageGeneration",
    position: { x: 0, y: 0 },
    data: {
      configVersion: 1,
      config: { prompt: "prompt", modelKey: "model/a", parameters: {} },
      selectedOutputImageId,
    },
  } satisfies ImageGenerationFlowNode;
}

function edge(
  id: string,
  source: string,
  kind: "primary" | "reference",
) {
  return {
    id,
    source,
    target: "target",
    data: { kind },
  } satisfies GenerationGraphFlowEdge;
}

describe("resolveImageNodeInputReadiness", () => {
  it("counts connected, ready, and missing primary/reference inputs", () => {
    const readiness = resolveImageNodeInputReadiness(
      "target",
      [node("source-ready", "image-1"), node("source-missing", null), node("target", null)],
      [
        edge("primary", "source-ready", "primary"),
        edge("reference", "source-missing", "reference"),
      ],
    );

    expect(readiness.primary).toEqual({
      connectedCount: 1,
      readyCount: 1,
      missingCount: 0,
    });
    expect(readiness.reference).toEqual({
      connectedCount: 1,
      readyCount: 0,
      missingCount: 1,
    });
    expect(readiness).toMatchObject({
      connectedCount: 2,
      readyCount: 1,
      missingCount: 1,
      resolvedCount: 1,
    });
  });

  it("reports distinct resolved outputs without hiding ready connections", () => {
    const readiness = resolveImageNodeInputReadiness(
      "target",
      [node("source-a", "image-shared"), node("source-b", "image-shared")],
      [
        edge("primary", "source-a", "primary"),
        edge("reference", "source-b", "reference"),
      ],
    );

    expect(readiness.readyCount).toBe(2);
    expect(readiness.resolvedCount).toBe(1);
  });

  it("ignores outgoing and unrelated edges", () => {
    const readiness = resolveImageNodeInputReadiness(
      "target",
      [node("target", null), node("other", "image-1")],
      [{ ...edge("outgoing", "target", "reference"), target: "other" }],
    );

    expect(readiness).toEqual({
      primary: { connectedCount: 0, readyCount: 0, missingCount: 0 },
      reference: { connectedCount: 0, readyCount: 0, missingCount: 0 },
      connectedCount: 0,
      readyCount: 0,
      missingCount: 0,
      resolvedCount: 0,
    });
  });
});
