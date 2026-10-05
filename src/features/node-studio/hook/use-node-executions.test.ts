import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../api/node-execution-api", async importOriginal => ({ ...await importOriginal<typeof import("../api/node-execution-api")>(), updateNodeExecution: api.update }));

import type { NodeExecutionDto } from "../model/node-execution-types";
import {
  hasActiveNodeExecution,
  nodeExecutionRefetchInterval,
  useSelectAssistantItem,
  nodeExecutionKeys,
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
  it("keeps a confirmed list choice when a pre-selection history read finishes late", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = nodeExecutionKeys.list("g", "n");
    const original = { ...execution("completed"), executionKind: "assistant" as const, mediaType: "text" as const, selectedItemId: "run:1", selectionVersion: 0 };
    const confirmed = { ...original, selectedItemId: "run:2", selectionVersion: 1 };
    client.setQueryData(key, [original]);
    let finishRead!: (rows: NodeExecutionDto[]) => void;
    const read = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<NodeExecutionDto[]>(resolve => { finishRead = resolve; }) }).catch(() => undefined);
    api.update.mockResolvedValueOnce(confirmed);
    const { result, unmount } = renderHook(() => useSelectAssistantItem(), { wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children) });
    await act(async () => { await result.current.mutateAsync({ graphId: "g", nodeId: "n", executionId: original.executionId, itemId: "run:2", expectedSelectionVersion: 0 }); });
    finishRead([original]); await read;
    expect(client.getQueryData<NodeExecutionDto[]>(key)?.[0]).toMatchObject({ selectedItemId: "run:2", selectionVersion: 1 });
    unmount(); client.clear();
  });
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

  it("retries discovery when the first history read has not succeeded", () => {
    expect(nodeExecutionRefetchInterval(undefined, "fallback")).toBe(2_000);
    expect(nodeExecutionRefetchInterval(undefined, "connected")).toBe(15_000);
  });

  it("does not poll an empty execution history", () => {
    expect(nodeExecutionRefetchInterval([], "fallback")).toBe(false);
  });
});
