import { describe, expect, it } from "vitest";

import {
  generationEventUrl,
  parseGenerationEventMessage,
} from "./generation-event-client";

describe("generation event client", () => {
  it("builds a Graph-scoped same-origin URL", () => {
    expect(generationEventUrl("graph/one")).toBe(
      "/api/generation-graphs/graph%2Fone/generation-events",
    );
  });

  it("accepts only the shared versioned event contract", () => {
    const event = {
      version: 1,
      type: "generation.updated",
      graphId: "graph-1",
      graphNodeId: "node-1",
      requestId: "request-1",
      status: "completed",
      progress: 100,
      updatedAt: "2026-08-24T12:00:00.000Z",
    };
    expect(parseGenerationEventMessage(JSON.stringify(event))).toEqual(event);
    expect(
      parseGenerationEventMessage(JSON.stringify({ ...event, version: 2 })),
    ).toBeNull();
  });
});
