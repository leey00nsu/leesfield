import {
  cancelNodeExecution,
  listNodeExecutions,
  startNodeExecution,
} from "./node-execution-api";

describe("node execution API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only expectedGraphVersion when starting a Node", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      execution: {
        executionId: "request-1",
        executionKind: "generation",
        mediaType: "audio",
        graphNodeId: "node-1",
        status: "pending",
        progress: 0,
      },
    }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await startNodeExecution("graph/1", "node/1", 5);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generation-graphs/graph%2F1/nodes/node%2F1/executions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedGraphVersion: 5 }),
      }),
    );
  });

  it("lists and cancels through the unified endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ executions: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ execution: { executionId: "request-1" } })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listNodeExecutions("graph-1", "node-1")).resolves.toEqual([]);
    await cancelNodeExecution("graph-1", "node-1", "request-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/generation-graphs/graph-1/nodes/node-1/executions/request-1",
      { method: "DELETE" },
    );
  });

  it("preserves typed server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "MEDIA_STORAGE_UNAVAILABLE",
    }), { status: 503 })));
    await expect(startNodeExecution("graph-1", "node-1", 1)).rejects.toEqual(
      expect.objectContaining({
        status: 503,
        code: "MEDIA_STORAGE_UNAVAILABLE",
      }),
    );
  });
});
