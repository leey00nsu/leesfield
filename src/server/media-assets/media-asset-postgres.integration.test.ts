// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";

import { MediaAssetNotFoundError, MediaQuotaExceededError } from "./media-asset-errors";
import { mediaAssetRepository } from "./media-asset-repository";

const integration = describe.skipIf(!process.env.DATABASE_URL);

integration("MediaAsset PostgreSQL lifecycle", () => {
  const suffix = randomUUID();
  const ownerEmail = `f059-${suffix}@example.com`;
  const graphId = `f059-graph-${suffix}`;
  const nodeId = `f059-node-${suffix}`;
  const sourceAssetId = `f059-source-${suffix}`;

  afterAll(async () => {
    await prisma.mediaUploadSession.deleteMany({ where: { ownerEmail } });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("preserves legacy Audio Edit output provenance and its asset after Graph deletion", async () => {
    await prisma.generationGraph.create({
      data: {
        id: graphId,
        ownerEmail,
        title: "F059 media integration",
        schemaVersion: 2,
        minimumWriterVersion: 2,
        nodes: {
          create: {
            id: nodeId,
            kind: "edit.audio.basic",
            x: 0,
            y: 0,
            configVersion: 1,
            config: { parameters: {} },
          },
        },
      },
    });
    await prisma.mediaAsset.create({
      data: {
        id: sourceAssetId,
        ownerEmail,
        type: "audio",
        origin: "upload",
        storageProvider: "leemage",
        storageObjectId: `source-file-${suffix}`,
        storageUrl: "https://storage.example/source.wav",
        mimeType: "audio/wav",
        bytes: BigInt(48),
        durationMs: 1_000,
      },
    });

    await expect(
      mediaAssetRepository.createUploadSession(
        ownerEmail,
        {
          intendedType: "audio",
          fileName: "over-quota.wav",
          declaredMimeType: "audio/wav",
          declaredBytes: 1,
          sortOrder: 0,
        },
        {
          objectId: `over-quota-${suffix}`,
          objectName: `project/over-quota-${suffix}.wav`,
          objectUrl: "https://storage.example/over-quota.wav",
          presignedUrl: "https://upload.example/over-quota.wav",
          expiresAt: new Date(Date.now() + 60_000),
        },
        BigInt(48),
      ),
    ).rejects.toBeInstanceOf(MediaQuotaExceededError);

    // Seed a pre-retirement execution, not a newly permitted Audio Edit run.
    // The current registry intentionally rejects creating this kind.
    const operation = await prisma.mediaOperation.create({ data: {
      ownerEmail,
      graphId,
      graphNodeId: nodeId,
      type: "edit.audio.basic",
      configVersion: 1,
      parameters: {},
      status: "processing",
      expectedOutputCount: 1,
      inputs: { create: [{ assetId: sourceAssetId, portId: "audio", sortOrder: 0 }] },
    },
    });
    const upload = await mediaAssetRepository.createUploadSession(
      ownerEmail,
      {
        intendedType: "audio",
        fileName: "edited.wav",
        declaredMimeType: "audio/wav",
        declaredBytes: 48,
        operationId: operation.id,
        outputPortId: "audio",
        sortOrder: 0,
      },
      {
        objectId: `output-file-${suffix}`,
        objectName: `project/output-file-${suffix}.wav`,
        objectUrl: "https://storage.example/output.wav",
        presignedUrl: "https://upload.example/output.wav",
        expiresAt: new Date(Date.now() + 60_000),
      },
      BigInt(5 * 1024 * 1024 * 1024),
    );
    await expect(
      mediaAssetRepository.claimUpload(ownerEmail, upload.id, new Date()),
    ).resolves.toMatchObject({ kind: "claimed" });
    const output = await mediaAssetRepository.completeUpload({
      ownerEmail,
      uploadId: upload.id,
      confirmed: {
        objectId: `output-file-${suffix}`,
        mimeType: "audio/wav",
        bytes: 48,
        url: "https://storage.example/output.wav",
      },
      inspected: {
        detectedMimeType: "audio/wav",
        width: null,
        height: null,
        durationMs: 1_000,
      },
      now: new Date(),
    });

    await expect(
      prisma.mediaOperation.findUnique({ where: { id: operation.id } }),
    ).resolves.toMatchObject({ status: "completed", progress: 100 });
    const generatedIds: string[] = [];
    for (const origin of ["generation", "legacy_generation"] as const) {
      const generated = await prisma.mediaAsset.create({ data: {
        ownerEmail, type: "audio", origin, storageProvider: "leemage", storageObjectId: `${origin}-${suffix}`, mimeType: "audio/wav",
      } });
      generatedIds.push(generated.id);
    }
    const uploads = await mediaAssetRepository.listAssets(ownerEmail, { type: "audio", category: "uploads", limit: 24 });
    expect(uploads.map(asset => asset.id)).toEqual([sourceAssetId]);
    const edited = await mediaAssetRepository.listAssets(ownerEmail, { type: "audio", category: "edited", limit: 24 });
    expect(edited.map(asset => asset.id)).toEqual([output.id]);
    const generatedPage = await mediaAssetRepository.listAssets(ownerEmail, { type: "audio", category: "generated", limit: 1 });
    expect(generatedPage).toHaveLength(2); // one result plus pagination lookahead
    const nextGenerated = await mediaAssetRepository.listAssets(ownerEmail, { type: "audio", category: "generated", limit: 1, cursor: generatedPage[0].id });
    expect(nextGenerated.map(asset => asset.id)).toEqual([generatedPage[1].id]);
    expect(generatedPage.map(asset => asset.id).sort()).toEqual(generatedIds.sort());
    await expect(mediaAssetRepository.listAssets(ownerEmail, { category: "generated", cursor: sourceAssetId, limit: 1 })).rejects.toBeInstanceOf(MediaAssetNotFoundError);
    await expect(
      prisma.generationGraphNodeOutput.findUnique({
        where: {
          graphNodeId_portId_sortOrder: { graphNodeId: nodeId, portId: "audio", sortOrder: 0 },
        },
      }),
    ).resolves.toMatchObject({ assetId: output.id });
    await expect(
      mediaAssetRepository.getAsset("other@example.com", output.id),
    ).rejects.toBeInstanceOf(MediaAssetNotFoundError);
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, output.id),
    ).resolves.toEqual({ graphIds: [graphId], operationIds: [] });

    await prisma.generationGraph.delete({ where: { id: graphId } });
    await expect(
      prisma.mediaAsset.findUnique({ where: { id: output.id } }),
    ).resolves.toMatchObject({ id: output.id, sourceOperationId: operation.id });
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, output.id),
    ).resolves.toEqual({ graphIds: [], operationIds: [] });
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, sourceAssetId),
    ).resolves.toEqual({ graphIds: [], operationIds: [operation.id] });
  });
});
