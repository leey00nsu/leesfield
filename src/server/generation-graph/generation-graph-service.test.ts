import { describe, expect, it, vi } from "vitest";

import {
  GenerationGraphInputError,
  GenerationGraphStructureError,
} from "./generation-graph-errors";
import type { GenerationGraphRepository } from "./generation-graph-repository";
import { createGenerationGraphService } from "./generation-graph-service";

function repositoryMock(): GenerationGraphRepository {
  return {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

const node = {
  id: "node_1",
  type: "imageGeneration",
  position: { x: 1, y: 2 },
  configVersion: 1,
  config: { prompt: "hello", modelKey: null, parameters: {} },
  selectedOutputImageId: null,
};

describe("generationGraphService", () => {
  it("creates a graph with the authenticated owner and normalized title", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.create).mockResolvedValue({} as never);
    const service = createGenerationGraphService(repository);

    await service.create("owner@example.com", { title: "  My graph " });

    expect(repository.create).toHaveBeenCalledWith("owner@example.com", "My graph");
  });

  it("rejects malformed input before repository access", async () => {
    const repository = repositoryMock();
    const service = createGenerationGraphService(repository);

    expect(() => service.create("owner@example.com", { title: "" })).toThrow(
      GenerationGraphInputError,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid graph before opening persistence", async () => {
    const repository = repositoryMock();
    const service = createGenerationGraphService(repository);

    expect(() =>
      service.update("owner@example.com", "graph_1", {
        expectedVersion: 1,
        title: "Graph",
        nodes: [node],
        edges: [
          {
            id: "edge_1",
            sourceNodeId: "node_1",
            targetNodeId: "node_1",
            kind: "reference",
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      }),
    ).toThrow(GenerationGraphStructureError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("passes a valid normalized snapshot to the repository", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.update).mockResolvedValue({} as never);
    const service = createGenerationGraphService(repository);

    await service.update("owner@example.com", "graph_1", {
      expectedVersion: 2,
      title: " Graph ",
      nodes: [node],
      edges: [],
    });

    expect(repository.update).toHaveBeenCalledWith(
      "owner@example.com",
      "graph_1",
      expect.objectContaining({ expectedVersion: 2, title: "Graph", nodes: [node] }),
    );
  });

  it("keeps owner scope on list, get, and delete", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.list).mockResolvedValue([]);
    vi.mocked(repository.get).mockResolvedValue({} as never);
    vi.mocked(repository.remove).mockResolvedValue(undefined);
    const service = createGenerationGraphService(repository);

    await service.list("owner@example.com");
    await service.get("owner@example.com", "graph_1");
    await service.remove("owner@example.com", "graph_1");

    expect(repository.list).toHaveBeenCalledWith("owner@example.com");
    expect(repository.get).toHaveBeenCalledWith("owner@example.com", "graph_1");
    expect(repository.remove).toHaveBeenCalledWith("owner@example.com", "graph_1");
  });
});
