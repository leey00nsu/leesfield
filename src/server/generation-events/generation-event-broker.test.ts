import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GenerationUpdatedEvent } from "@/shared/generation-events/generation-event-contract";
import {
  GenerationEventBroker,
  type GenerationEventListenerClient,
} from "./generation-event-broker";

class FakeClient
  extends EventEmitter
  implements GenerationEventListenerClient
{
  connect = vi.fn(async () => undefined);
  query = vi.fn(async () => undefined);
  end = vi.fn(async () => undefined);
}

const event = (graphId: string): GenerationUpdatedEvent => ({
  version: 1,
  type: "generation.updated",
  graphId,
  graphNodeId: `${graphId}-node`,
  requestId: `${graphId}-request`,
  status: "processing",
  progress: 10,
  updatedAt: "2026-08-24T12:00:00.000Z",
});

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("GenerationEventBroker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one listener and isolates Graph subscribers", async () => {
    const client = new FakeClient();
    const createClient = vi.fn(() => client);
    const broker = new GenerationEventBroker({ createClient });
    const graphOne = vi.fn();
    const graphTwo = vi.fn();

    const unsubscribeOne = broker.subscribe("graph-1", { onEvent: graphOne });
    const unsubscribeTwo = broker.subscribe("graph-2", { onEvent: graphTwo });
    await flush();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      "LISTEN leesfield_generation_events_v1",
    );

    client.emit("notification", {
      channel: "leesfield_generation_events_v1",
      payload: JSON.stringify(event("graph-1")),
    });
    expect(graphOne).toHaveBeenCalledWith(event("graph-1"));
    expect(graphTwo).not.toHaveBeenCalled();

    client.emit("notification", {
      channel: "leesfield_generation_events_v1",
      payload: "malformed",
    });
    expect(graphOne).toHaveBeenCalledTimes(1);

    unsubscribeOne();
    unsubscribeTwo();
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("reports degradation and reconnects with bounded jitter", async () => {
    vi.useFakeTimers();
    const first = new FakeClient();
    const second = new FakeClient();
    const createClient = vi
      .fn<() => GenerationEventListenerClient>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const states: string[] = [];
    const broker = new GenerationEventBroker({
      createClient,
      random: () => 0.5,
      reconnectBaseMs: 100,
      reconnectMaxMs: 200,
    });

    const unsubscribe = broker.subscribe("graph-1", {
      onEvent: vi.fn(),
      onState: (state) => states.push(state),
    });
    await flush();
    expect(states).toContain("connected");

    first.emit("error", new Error("connection lost"));
    expect(states.at(-1)).toBe("degraded");
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("connected");
    unsubscribe();
  });

  it("cancels reconnect when the last subscriber leaves", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    client.connect.mockRejectedValueOnce(new Error("offline"));
    const createClient = vi.fn(() => client);
    const broker = new GenerationEventBroker({
      createClient,
      random: () => 0.5,
      reconnectBaseMs: 100,
    });

    const unsubscribe = broker.subscribe("graph-1", { onEvent: vi.fn() });
    await flush();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
