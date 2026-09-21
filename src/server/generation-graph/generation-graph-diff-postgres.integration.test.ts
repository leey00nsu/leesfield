// @vitest-environment node

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { generationGraphRepository } from "@/server/generation-graph/generation-graph-repository";
import { GenerationGraphVersionConflictError } from "@/server/generation-graph/generation-graph-errors";
import type { UpdateGenerationGraphInput } from "@/server/generation-graph/generation-graph-contract";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

const integration = describe.skipIf(!postgresIntegrationEnabled);

type GraphNodeInput = UpdateGenerationGraphInput["nodes"][number];
type GraphEdgeInput = UpdateGenerationGraphInput["edges"][number];

function node(id: string, x: number, kind = "input.prompt", config: Record<string, unknown> = { text: id }): GraphNodeInput {
  return {
    id,
    kind,
    position: { x, y: 0 },
    configVersion: 1,
    config: config as GraphNodeInput["config"],
    selectedOutputAssetId: null,
  };
}

function updateInput(
  graph: { version: number },
  title: string,
  nodes: GraphNodeInput[],
  edges: GraphEdgeInput[] = [],
) {
  return {
    schemaVersion: 3 as const,
    groups: [],
    expectedVersion: graph.version,
    title,
    nodes,
    edges,
  };
}

integration("generation graph diff writes", () => {
  const ownerEmail = `it-graph-diff-${randomUUID()}@example.com`;
  const graphIds: string[] = [];

  afterAll(async () => {
    if (graphIds.length > 0) {
      await prisma.generationGraph.deleteMany({ where: { id: { in: graphIds } } });
    }
  });

  it("keeps unchanged rows intact in a maximum-size Graph update", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Maximum Graph");
    graphIds.push(graph.id);
    const nodes = Array.from({ length: 500 }, (_, index) => node(`node-${index}`, index));
    await prisma.generationGraphNode.createMany({
      data: nodes.map((value) => ({
        id: value.id,
        graphId: graph.id,
        kind: value.kind,
        x: value.position.x,
        y: value.position.y,
        configVersion: value.configVersion,
        config: value.config as Prisma.InputJsonValue,
        selectedOutputAssetId: value.selectedOutputAssetId,
      })),
    });
    const before = await prisma.generationGraphNode.findMany({
      where: { graphId: graph.id },
      select: { id: true, x: true, updatedAt: true },
    });
    const changed = nodes.map((value, index) => index === 251
      ? { ...value, position: { x: value.position.x + 1, y: value.position.y } }
      : value);

    const saved = await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput(graph, "Maximum Graph", changed),
    );
    const after = await prisma.generationGraphNode.findMany({
      where: { graphId: graph.id },
      select: { id: true, x: true, updatedAt: true },
    });
    const beforeById = new Map(before.map((value) => [value.id, value]));

    expect(saved.version).toBe(2);
    expect(after).toHaveLength(500);
    expect(after.find((value) => value.id === "node-251")?.x).toBe(252);
    for (const value of after.filter((row) => row.id !== "node-251")) {
      expect(value.updatedAt).toEqual(beforeById.get(value.id)?.updatedAt);
    }
  });

  it("converges concurrent saves through the existing version CAS", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Concurrent Graph");
    graphIds.push(graph.id);
    const first = updateInput(graph, "First", [node("concurrent-node", 1)]);
    const second = updateInput(graph, "Second", [node("concurrent-node", 2)]);

    const results = await Promise.allSettled([
      generationGraphRepository.update(ownerEmail, graph.id, first),
      generationGraphRepository.update(ownerEmail, graph.id, second),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(GenerationGraphVersionConflictError);
    await expect(generationGraphRepository.get(ownerEmail, graph.id)).resolves.toMatchObject({
      version: 2,
      title: expect.stringMatching(/^(First|Second)$/),
    });
  });

  it("updates and removes only the changed edge and node rows", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Edge Graph");
    graphIds.push(graph.id);
    const promptA = node("edge-prompt-a", 0);
    const promptB = node("edge-prompt-b", 50);
    const image = node("edge-image", 100, "generate.image", {
      prompt: "",
      modelKey: null,
      parameters: {},
    });
    const edge = {
      id: "edge-1",
      sourceNodeId: promptA.id,
      targetNodeId: image.id,
      sourcePortId: "text",
      targetPortId: "prompt",
      sortOrder: 0,
      hasPause: false,
    } satisfies GraphEdgeInput;

    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput(graph, "Edge Graph", [promptA, promptB, image], [edge]),
    );
    await expect(prisma.generationGraphEdge.findMany({
      where: { graphId: graph.id },
      select: { id: true, sourceNodeId: true },
    })).resolves.toEqual([{ id: edge.id, sourceNodeId: promptA.id }]);
    const switchedEdge = { ...edge, sourceNodeId: promptB.id };
    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput({ version: 2 }, "Edge Graph", [promptA, promptB, image], [switchedEdge]),
    );
    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput({ version: 3 }, "Edge Graph", [promptA, image], [edge]),
    );

    const final = await generationGraphRepository.get(ownerEmail, graph.id);
    expect(final.nodes.map((value) => value.id)).toEqual([promptA.id, image.id]);
    expect(final.edges).toMatchObject([{ id: edge.id, sourceNodeId: promptA.id }]);
  });
});
