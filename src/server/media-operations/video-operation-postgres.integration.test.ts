// @vitest-environment node

import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

describe.skipIf(!postgresIntegrationEnabled)("server video operation persistence", () => {
  const suffix = randomUUID();
  const ownerEmail = `video-operation-${suffix}@example.com`;
  const graphId = `video-operation-${suffix}`;
  const stitchId = `stitch-${suffix}`;
  const trimId = `trim-${suffix}`;
  const clipIds = [`clip-a-${suffix}`, `clip-b-${suffix}`];

  afterAll(async () => {
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("links Stitch and Trim video artifacts to Graph outputs and History with lease fencing", async () => {
    await prisma.generationGraph.create({
      data: {
        id: graphId, ownerEmail, title: "Video operation integration", schemaVersion: 2,
        minimumWriterVersion: 2,
        nodes: { create: [
          { id: stitchId, kind: "edit.video.stitch", x: 0, y: 0, configVersion: 1,
            config: { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } } },
          { id: trimId, kind: "edit.video.trim", x: 300, y: 0, configVersion: 1,
            config: { parameters: { startMs: 0, endMs: 500, stripAudio: false } } },
        ] },
      },
    });
    for (const id of clipIds) {
      await prisma.mediaAsset.create({ data: {
        id, ownerEmail, type: "video", status: "completed", origin: "upload",
        storageProvider: "leemage", storageObjectId: id,
        storageUrl: `https://storage.example/${id}.mp4`, mimeType: "video/mp4",
        bytes: BigInt(1024), width: 320, height: 180, durationMs: 600,
      } });
    }
    const cases: Array<[
      string,
      "edit.video.stitch" | "edit.video.trim",
      Record<string, number | boolean | string[]>,
      Array<{ assetId: string; portId: string; sortOrder: number }>,
    ]> = [
      [stitchId, "edit.video.stitch", { repeat: 1, stripAudio: false, clipOrder: [] }, [
        { assetId: clipIds[0], portId: "clips", sortOrder: 0 },
        { assetId: clipIds[1], portId: "clips", sortOrder: 1 },
      ]],
      [trimId, "edit.video.trim", { startMs: 0, endMs: 500, stripAudio: false }, [
        { assetId: clipIds[0], portId: "video", sortOrder: 0 },
      ]],
    ];
    for (const [nodeId, type, parameters, inputs] of cases) {
      const operation = await mediaAssetRepository.createOperation(ownerEmail, {
        graphId, graphNodeId: nodeId, type, configVersion: 1,
        parameters, inputs: [...inputs], expectedOutputCount: 1,
      });
      const claimed = await mediaAssetRepository.claimPendingServerOperation(operation.id);
      expect(claimed?.operation.type).toBe(type);
      if (!claimed) throw new Error("operation was not claimed");
      const artifactId = `output-${type}-${suffix}`;
      await mediaAssetRepository.completeServerOperation(ownerEmail, operation.id, [{
        type: "video", storageProvider: "leemage", storageObjectId: artifactId,
        storageUrl: `https://storage.example/${artifactId}.mp4`, mimeType: "video/mp4",
        bytes: 2048, width: 320, height: 180, durationMs: type === "edit.video.trim" ? 500 : 1200,
      }], new Date(), claimed.lease);
      const output = await prisma.generationGraphNodeOutput.findFirst({
        where: { graphNodeId: nodeId, portId: "video" }, include: { asset: true },
      });
      expect(output?.asset).toMatchObject({
        origin: "media_operation", type: "video", sourceOperationId: operation.id,
      });
      expect((await mediaAssetRepository.listAssets(ownerEmail, { type: "video", category: "edited", limit: 20 }))
        .some((asset) => asset.id === output?.assetId)).toBe(true);
      expect((await prisma.mediaOperation.findUnique({ where: { id: operation.id } }))?.status).toBe("completed");
    }
  });
});
