import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const graphService = vi.hoisted(() => ({ get: vi.fn() }));
const broker = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/generation-graph/generation-graph-service", () => ({
  generationGraphService: graphService,
}));
vi.mock("@/server/generation-events/generation-event-broker", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/generation-events/generation-event-broker")
  >("@/server/generation-events/generation-event-broker");
  return { ...actual, getGenerationEventBroker: () => broker };
});

import { GenerationGraphNotFoundError } from "@/server/generation-graph/generation-graph-errors";
import type { GenerationEventSubscriber } from "@/server/generation-events/generation-event-broker";
import { GET } from "./route";

const context = { params: Promise.resolve({ graphId: "graph-1" }) };
const decoder = new TextDecoder();

function request(controller = new AbortController()) {
  return {
    controller,
    value: new Request("http://localhost/api/generation-events", {
      signal: controller.signal,
    }),
  };
}

async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const result = await reader.read();
  return result.done ? null : decoder.decode(result.value);
}

describe("Graph generation event stream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "owner@example.com",
    });
    graphService.get.mockResolvedValue({ id: "graph-1" });
  });

  it("returns 401 before Graph or broker access", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET(request().value, context);
    expect(response.status).toBe(401);
    expect(graphService.get).not.toHaveBeenCalled();
    expect(broker.subscribe).not.toHaveBeenCalled();
  });

  it("conceals missing and foreign Graphs as 404", async () => {
    graphService.get.mockRejectedValue(new GenerationGraphNotFoundError());
    const response = await GET(request().value, context);
    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe("GRAPH_NOT_FOUND");
    expect(broker.subscribe).not.toHaveBeenCalled();
  });

  it("streams ready and minimal generation frames for an owned Graph", async () => {
    const unsubscribe = vi.fn();
    let subscriber: GenerationEventSubscriber | undefined;
    broker.subscribe.mockImplementation(
      (_graphId: string, next: GenerationEventSubscriber) => {
        subscriber = next;
        next.onState?.("connected");
        return unsubscribe;
      },
    );
    const { controller, value } = request();
    const response = await GET(value, context);
    const reader = response.body!.getReader();

    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "no-cache, no-transform",
    );
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(graphService.get).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
    );
    expect(await readFrame(reader)).toContain("event: stream.ready");

    subscriber!.onEvent({
      version: 1,
      type: "generation.updated",
      graphId: "graph-1",
      graphNodeId: "node-1",
      requestId: "request-1",
      status: "completed",
      progress: 100,
      updatedAt: "2026-08-24T12:00:00.000Z",
    });
    const frame = await readFrame(reader);
    expect(frame).toContain("event: generation.updated");
    expect(frame).toContain("id: request-1:2026-08-24T12:00:00.000Z");
    expect(frame).toContain('"graphNodeId":"node-1"');
    expect(frame).not.toContain("prompt");

    controller.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("writes heartbeat comments and cleans up a canceled stream", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    broker.subscribe.mockImplementation(() => unsubscribe);
    const response = await GET(request().value, context);
    const reader = response.body!.getReader();

    const pendingFrame = readFrame(reader);
    await vi.advanceTimersByTimeAsync(15_000);
    const heartbeatFrame = await pendingFrame;
    expect(heartbeatFrame).toContain(": heartbeat");
    expect(heartbeatFrame).toContain("event: stream.heartbeat");
    expect(heartbeatFrame).toContain('"version":1');
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("signals degradation and closes the stream", async () => {
    const unsubscribe = vi.fn();
    let subscriber: GenerationEventSubscriber | undefined;
    broker.subscribe.mockImplementation(
      (_graphId: string, next: GenerationEventSubscriber) => {
        subscriber = next;
        return unsubscribe;
      },
    );
    const response = await GET(request().value, context);
    const reader = response.body!.getReader();

    subscriber!.onState?.("degraded");
    expect(await readFrame(reader)).toContain("event: stream.degraded");
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cleans up when the broker is already degraded during subscribe", async () => {
    const unsubscribe = vi.fn();
    broker.subscribe.mockImplementation(
      (_graphId: string, next: GenerationEventSubscriber) => {
        next.onState?.("degraded");
        return unsubscribe;
      },
    );
    const response = await GET(request().value, context);
    const reader = response.body!.getReader();

    expect(await readFrame(reader)).toContain("event: stream.degraded");
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
