import { describe, expect, it } from "vitest";

import {
  generationEventId,
  generationUpdatedEventSchema,
  parseGenerationEvent,
} from "./generation-event-contract";

const event = {
  version: 1 as const,
  type: "generation.updated" as const,
  graphId: "graph-1",
  graphNodeId: "node-1",
  requestId: "request-1",
  status: "processing" as const,
  progress: 10,
  updatedAt: "2026-08-24T12:00:00.000Z",
};

describe("generation event contract", () => {
  it("parses the versioned minimal event and derives an id", () => {
    expect(parseGenerationEvent(JSON.stringify(event))).toEqual(event);
    expect(generationEventId(event)).toBe(
      "request-1:2026-08-24T12:00:00.000Z",
    );
  });

  it("rejects malformed, unsupported and sensitive payloads", () => {
    expect(parseGenerationEvent("not-json")).toBeNull();
    expect(
      parseGenerationEvent(JSON.stringify({ ...event, version: 2 })),
    ).toBeNull();
    expect(
      parseGenerationEvent(JSON.stringify({ ...event, progress: 101 })),
    ).toBeNull();
    expect(
      parseGenerationEvent(
        JSON.stringify({ ...event, prompt: "must not be published" }),
      ),
    ).toBeNull();
  });

  it("accepts every persisted image generation status", () => {
    for (const status of [
      "pending",
      "processing",
      "completed",
      "failed",
    ] as const) {
      expect(generationUpdatedEventSchema.parse({ ...event, status }).status).toBe(
        status,
      );
    }
  });
});
