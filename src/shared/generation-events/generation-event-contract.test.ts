import { describe, expect, it } from "vitest";

import {
  GENERATION_EVENT_CHANNEL,
  generationEventId,
  nodeExecutionUpdatedEventSchema,
  parseGenerationEvent,
} from "./generation-event-contract";

const event = {
  version: 2 as const,
  type: "node-execution.updated" as const,
  executionKind: "media_operation" as const,
  mediaType: "audio" as const,
  graphId: "graph-1",
  graphNodeId: "node-2",
  executionId: "operation-1",
  status: "completed" as const,
  progress: 100,
  updatedAt: "2026-09-04T00:00:00.000Z",
};

describe("generation event contract", () => {
  it("uses the v2-only channel and derives a stable event id", () => {
    expect(GENERATION_EVENT_CHANNEL).toBe("leesfield_node_execution_events_v2");
    expect(parseGenerationEvent(JSON.stringify(event))).toEqual(event);
    expect(generationEventId(event)).toBe(
      "operation-1:2026-09-04T00:00:00.000Z",
    );
  });

  it("rejects v1, malformed, unsupported and sensitive payloads", () => {
    expect(parseGenerationEvent("not-json")).toBeNull();
    expect(parseGenerationEvent(JSON.stringify({
      version: 1,
      type: "generation.updated",
      graphId: "graph-1",
      graphNodeId: "node-1",
      requestId: "request-1",
      status: "processing",
      progress: 10,
      updatedAt: "2026-08-24T12:00:00.000Z",
    }))).toBeNull();
    expect(parseGenerationEvent(JSON.stringify({ ...event, version: 3 }))).toBeNull();
    expect(parseGenerationEvent(JSON.stringify({ ...event, progress: 101 }))).toBeNull();
    for (const sensitive of [
      { prompt: "secret" },
      { parameters: { seed: 1 } },
      { credential: "token" },
      { errorMessage: "provider detail" },
      { assetUrl: "https://example.com/private" },
    ]) {
      expect(parseGenerationEvent(JSON.stringify({ ...event, ...sensitive }))).toBeNull();
    }
  });

  it("accepts generation and media-operation events for every status", () => {
    for (const executionKind of ["generation", "media_operation"] as const) {
      for (const status of [
        "pending",
        "processing",
        "uploading",
        "completed",
        "failed",
        "cancelled",
      ] as const) {
        expect(nodeExecutionUpdatedEventSchema.parse({
          ...event,
          executionKind,
          status,
        })).toMatchObject({ executionKind, status });
      }
    }
  });
});
