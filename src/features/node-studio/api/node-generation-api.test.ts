import {
  executeNodeGeneration,
  listNodeGenerations,
} from "./node-generation-api";

describe("node generation api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists Node generations with the query signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ generations: [] }), { status: 200 }),
    );
    await expect(
      listNodeGenerations("graph/1", "node/1", controller.signal),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generation-graphs/graph%2F1/nodes/node%2F1/generations",
      { cache: "no-store", signal: controller.signal },
    );
  });

  it("posts only expectedGraphVersion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          generation: { requestId: "request-1", status: "pending", progress: 0 },
        }),
        { status: 202 },
      ),
    );
    await executeNodeGeneration("graph-1", "node-1", 4);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generation-graphs/graph-1/nodes/node-1/generations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedGraphVersion: 4 }),
      }),
    );
  });

  it("keeps AbortError as a normal fetch cancellation", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    await expect(
      listNodeGenerations("graph-1", "node-1"),
    ).rejects.toBe(abortError);
  });

  it("maps API responses to a typed error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "GRAPH_VERSION_CONFLICT", errors: { graph: [] } }),
        { status: 409 },
      ),
    );
    await expect(
      executeNodeGeneration("graph-1", "node-1", 3),
    ).rejects.toMatchObject({
      status: 409,
      code: "GRAPH_VERSION_CONFLICT",
    });
  });
});
