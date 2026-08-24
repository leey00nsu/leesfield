import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GenerationEventSource } from "../api/generation-event-client";
import { useGenerationEventChannelState } from "../model/generation-event-channel-context";
import { nodeGenerationKeys } from "./use-node-generations";
import { GenerationEventChannelProvider } from "./use-generation-event-channel";

class FakeEventSource implements GenerationEventSource {
  readonly close = vi.fn();
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<
    string,
    Set<(event: { data: string }) => void>
  >();

  addEventListener(
    type: string,
    listener: (event: { data: string }) => void,
  ) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data = "{}") {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function StateProbe() {
  return <div data-testid="state">{useGenerationEventChannelState()}</div>;
}

function setup(graphId = "graph-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi
    .spyOn(queryClient, "invalidateQueries")
    .mockResolvedValue(undefined);
  const sources: FakeEventSource[] = [];
  const factory = vi.fn(() => {
    const source = new FakeEventSource();
    sources.push(source);
    return source;
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <GenerationEventChannelProvider
        graphId={graphId}
        eventSourceFactory={factory}
        random={() => 0.5}
      >
        <StateProbe />
      </GenerationEventChannelProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, invalidate, factory, sources };
}

const generationEvent = JSON.stringify({
  version: 1,
  type: "generation.updated",
  graphId: "graph-1",
  graphNodeId: "node-1",
  requestId: "request-1",
  status: "processing",
  progress: 10,
  updatedAt: "2026-08-24T12:00:00.000Z",
});

describe("GenerationEventChannelProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one Graph stream and invalidates only the event Node query", async () => {
    const { sources, factory, invalidate, queryClient } = setup();
    expect(factory).toHaveBeenCalledWith(
      "/api/generation-graphs/graph-1/generation-events",
    );
    expect(screen.getByTestId("state")).toHaveTextContent("connecting");

    await act(async () => sources[0].emit("stream.ready"));
    expect(screen.getByTestId("state")).toHaveTextContent("connected");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: nodeGenerationKeys.graph("graph-1"),
      refetchType: "active",
    });

    invalidate.mockClear();
    await act(async () =>
      sources[0].emit("generation.updated", generationEvent),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: nodeGenerationKeys.list("graph-1", "node-1"),
    });

    const cachedSnapshot = [{ requestId: "request-1", status: "completed" }];
    queryClient.setQueryData(
      nodeGenerationKeys.list("graph-1", "node-1"),
      cachedSnapshot,
    );
    await act(async () => {
      sources[0].emit("generation.updated", generationEvent);
      sources[0].emit(
        "generation.updated",
        generationEvent.replace('"status":"processing"', '"status":"pending"'),
      );
    });
    expect(
      queryClient.getQueryData(
        nodeGenerationKeys.list("graph-1", "node-1"),
      ),
    ).toEqual(cachedSnapshot);

    invalidate.mockClear();
    await act(async () =>
      sources[0].emit("generation.updated", "malformed"),
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("falls back on error and reconnects with bounded backoff", async () => {
    vi.useFakeTimers();
    const { sources, factory } = setup();
    await act(async () => sources[0].emit("stream.ready"));

    await act(async () => sources[0].onerror?.());
    expect(sources[0].close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("fallback");

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(factory).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("state")).toHaveTextContent("connecting");
  });

  it("uses a heartbeat watchdog before reconnecting", async () => {
    vi.useFakeTimers();
    const { sources, factory, rerender } = setup();
    await act(async () => sources[0].emit("stream.ready"));
    await act(async () => vi.advanceTimersByTimeAsync(35_000));
    expect(screen.getByTestId("state")).toHaveTextContent("fallback");
    expect(sources[0].close).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <GenerationEventChannelProvider
          graphId="graph-2"
          eventSourceFactory={factory}
          random={() => 0.5}
        >
          <StateProbe />
        </GenerationEventChannelProvider>
      </QueryClientProvider>,
    );
    expect(factory).toHaveBeenLastCalledWith(
      "/api/generation-graphs/graph-2/generation-events",
    );
  });

  it("closes the connected stream on Graph switch and unmount", async () => {
    const { sources, factory, rerender, unmount } = setup();
    await act(async () => sources[0].emit("stream.ready"));

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <GenerationEventChannelProvider
          graphId="graph-2"
          eventSourceFactory={factory}
          random={() => 0.5}
        >
          <StateProbe />
        </GenerationEventChannelProvider>
      </QueryClientProvider>,
    );

    expect(sources[0].close).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenLastCalledWith(
      "/api/generation-graphs/graph-2/generation-events",
    );
    expect(sources).toHaveLength(2);

    unmount();
    expect(sources[1].close).toHaveBeenCalledTimes(1);
  });

  it("stays on polling fallback when EventSource is unavailable", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationEventChannelProvider
          graphId="graph-1"
          eventSourceFactory={() => null}
        >
          <StateProbe />
        </GenerationEventChannelProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("fallback");
  });
});
