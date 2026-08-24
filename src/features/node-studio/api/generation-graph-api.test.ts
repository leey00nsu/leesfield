import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGenerationGraph,
  deleteGenerationGraph,
  getGenerationGraph,
  listGenerationGraphs,
  updateGenerationGraph,
} from "./generation-graph-api";

const graph = {
  id: "graph_1",
  title: "Graph",
  version: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  nodes: [],
  edges: [],
};

function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generation graph api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists and loads graphs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ graphs: [graph] }))
      .mockResolvedValueOnce(response({ graph }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listGenerationGraphs()).resolves.toEqual([graph]);
    await expect(getGenerationGraph("graph_1")).resolves.toEqual(graph);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/generation-graphs/graph_1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("creates, updates, and deletes a graph", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ graph }, 201))
      .mockResolvedValueOnce(response({ graph: { ...graph, version: 2 } }))
      .mockResolvedValueOnce(response(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createGenerationGraph("Graph")).resolves.toEqual(graph);
    await expect(
      updateGenerationGraph("graph_1", {
        expectedVersion: 1,
        title: "Graph",
        nodes: [],
        edges: [],
      }),
    ).resolves.toMatchObject({ version: 2 });
    await expect(deleteGenerationGraph("graph_1")).resolves.toBeUndefined();
  });

  it.each([
    [400, "INVALID_REQUEST"],
    [404, "GRAPH_NOT_FOUND"],
    [409, "GRAPH_VERSION_CONFLICT"],
    [500, "DB_SAVE_FAILED"],
  ])("maps %i responses to a typed %s error", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: code }, status)));

    await expect(getGenerationGraph("graph_1")).rejects.toMatchObject({
      status,
      code,
    });
  });
});
