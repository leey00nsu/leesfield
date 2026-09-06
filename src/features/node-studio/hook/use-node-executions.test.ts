import { describe, expect, it } from "vitest";

import type { NodeExecutionDto } from "../model/node-execution-types";
import {
  hasActiveNodeExecution,
  nodeExecutionRefetchInterval,
} from "./use-node-executions";

function execution(status: NodeExecutionDto["status"]): NodeExecutionDto {
  return {
    executionId: "execution-1",
    executionKind: "media_operation",
    mediaType: "audio",
    graphNodeId: "node-1",
    status,
    progress: 0,
    errorCode: null,
    modelKey: null,
    outputAssetIds: [],
    createdAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("Node execution polling", () => {
  it.each(["pending", "processing", "uploading"] as const)(
    "keeps %s executions converging",
    (status) => {
      expect(hasActiveNodeExecution([execution(status)])).toBe(true);
      expect(
        nodeExecutionRefetchInterval([execution(status)], "connected"),
      ).toBe(15_000);
      expect(
        nodeExecutionRefetchInterval([execution(status)], "fallback"),
      ).toBe(2_000);
      expect(
        nodeExecutionRefetchInterval([execution(status)], "connecting"),
      ).toBe(2_000);
    },
  );

  it.each(["completed", "failed", "cancelled"] as const)(
    "stops polling terminal %s executions",
    (status) => {
      expect(hasActiveNodeExecution([execution(status)])).toBe(false);
      expect(
        nodeExecutionRefetchInterval([execution(status)], "fallback"),
      ).toBe(false);
    },
  );

  it("does not poll an empty execution history", () => {
    expect(nodeExecutionRefetchInterval([], "fallback")).toBe(false);
  });
});
