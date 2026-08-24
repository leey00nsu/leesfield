import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  nodeGenerationRefetchInterval,
  shouldPollNodeGenerations,
  useExecuteNodeGeneration,
} from "./use-node-generations";
import type { NodeGenerationDto } from "../model/node-generation-types";

function generation(status: NodeGenerationDto["status"]): NodeGenerationDto {
  return {
    requestId: "request-1",
    status,
    progress: 0,
    errorMessage: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    modelKey: "model-a",
    images: [],
  };
}

describe("shouldPollNodeGenerations", () => {
  it.each(["pending", "processing"] as const)(
    "polls the latest %s Generation",
    (status) => {
      expect(shouldPollNodeGenerations([generation(status)])).toBe(true);
    },
  );

  it.each(["completed", "failed"] as const)(
    "stops polling the latest %s Generation",
    (status) => {
      expect(shouldPollNodeGenerations([generation(status)])).toBe(false);
    },
  );

  it("does not poll an empty Node history", () => {
    expect(shouldPollNodeGenerations([])).toBe(false);
  });

  it("uses safety polling while connected and fast polling in fallback", () => {
    expect(nodeGenerationRefetchInterval([generation("processing")], "connected")).toBe(
      15_000,
    );
    expect(nodeGenerationRefetchInterval([generation("processing")], "fallback")).toBe(
      2_000,
    );
    expect(nodeGenerationRefetchInterval([generation("completed")], "connected")).toBe(
      false,
    );
  });
});

describe("useExecuteNodeGeneration", () => {
  it("rejects a second client submission while the first is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useExecuteNodeGeneration(), { wrapper });
    const variables = {
      graphId: "graph-1",
      nodeId: "node-1",
      expectedGraphVersion: 4,
    };

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.mutateAsync(variables);
    });
    await expect(result.current.mutateAsync(variables)).rejects.toMatchObject({
      code: "NODE_GENERATION_ACTIVE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveFetch(
      new Response(
        JSON.stringify({
          generation: { requestId: "request-1", status: "pending", progress: 0 },
        }),
        { status: 202 },
      ),
    );
    await expect(first).resolves.toEqual(
      expect.objectContaining({ requestId: "request-1" }),
    );
  });
});
