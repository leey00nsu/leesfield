// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

import { MediaAssetNotFoundError, MediaOperationConflictError, MediaQuotaExceededError } from "./media-asset-errors";
import { mediaAssetRepository } from "./media-asset-repository";

const integration = describe.skipIf(!postgresIntegrationEnabled);

integration("MediaAsset PostgreSQL lifecycle", () => {
  const suffix = randomUUID();
  const ownerEmail = `f059-${suffix}@example.com`;
  const graphId = `f059-graph-${suffix}`;
  const nodeId = `f059-node-${suffix}`;
  const sourceAssetId = `f059-source-${suffix}`;
  const generationRequestId = `f059-generation-${suffix}`;

  afterAll(async () => {
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail } });
    await prisma.mediaUploadSession.deleteMany({ where: { ownerEmail } });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("records browser frame captures as edited assets with owned video provenance, idempotent confirmation and no source output mutation", async () => {
    const captureGraph = "capture-" + suffix;
    const video = await prisma.mediaAsset.create({ data: { ownerEmail, type: "video", origin: "upload",
      storageProvider: "leemage", storageObjectId: "capture-video-" + suffix, storageUrl: "https://storage.example/video.mp4",
      mimeType: "video/mp4", durationMs: 3000 } });
    const graph = await prisma.generationGraph.create({ data: { id: captureGraph, ownerEmail, title: "Capture",
      nodes: { create: { id: "capture-source-" + suffix, kind: "input.video", configVersion: 1,
        config: { assetId: video.id }, selectedOutputAssetId: video.id, x: 0, y: 0 } } } });
    const uploads: string[] = [];
    const presign = () => { const id = randomUUID(); return { objectId: id, objectName: id, objectUrl: "https://storage.example/" + id,
      presignedUrl: "https://upload.example/" + id, expiresAt: new Date(Date.now() + 60000) }; };
    const base = { intendedType: "image" as const, fileName: "unrelated-name.png", declaredMimeType: "image/png", declaredBytes: 33, sortOrder: 0 };
    try {
      for (const timestampMs of [0, 1250, 2999]) {
        const upload = await mediaAssetRepository.createUploadSession(ownerEmail,
          { ...base, videoCapture: { graphId: graph.id, sourceAssetId: video.id, timestampMs } }, presign(), BigInt(100000));
        uploads.push(upload.id);
        expect(upload.operation).toMatchObject({ type: "edit.video.frameGrab", graphNodeId: null, status: "uploading" });
        const complete = { ownerEmail, uploadId: upload.id,
          confirmed: { objectId: upload.storageObjectId, url: upload.storageUrl, mimeType: "image/png", bytes: 33 },
          inspected: { detectedMimeType: "image/png", width: 320, height: 180, durationMs: null }, now: new Date() };
        await mediaAssetRepository.claimUpload(ownerEmail, upload.id, new Date());
        const asset = await mediaAssetRepository.completeUpload(complete);
        expect(asset).toMatchObject({ origin: "media_operation", sourceOperationId: upload.operationId, type: "image" });
        expect(await mediaAssetRepository.claimUpload(ownerEmail, upload.id, new Date())).toMatchObject({ kind: "completed", asset: { id: asset.id } });
        const operation = await mediaAssetRepository.getOperation(ownerEmail, upload.operationId!);
        expect(operation).toMatchObject({ status: "completed", progress: 100, parameters: { timestampMs },
          inputs: [{ assetId: video.id, portId: "video", sortOrder: 0 }], outputs: [{ id: asset.id }],
          outputBindings: [{ assetId: asset.id, portId: "image", sortOrder: 0 }] });
        const edited = await mediaAssetRepository.listAssets(ownerEmail, { category: "edited", type: "image", limit: 24 });
        expect(edited.some(item => item.id === asset.id)).toBe(true);
        const ordinary = await mediaAssetRepository.listAssets(ownerEmail, { category: "uploads", type: "image", limit: 24 });
        expect(ordinary.some(item => item.id === asset.id)).toBe(false);
        const { getHistory } = await import("@/server/history/handlers/get-history");
        const history = await getHistory(new URLSearchParams("type=image&origin=edit"), ownerEmail);
        expect(history.items.find(item => item.id === operation.id)).toMatchObject({ origin: "edit", assetId: asset.id,
          graphId: graph.id, graphNodeId: null, sourceAssetIds: [video.id], operation: { type: "edit.video.frameGrab", parameters: { timestampMs } } });
      }
      expect(await prisma.generationGraphNode.findUnique({ where: { id: "capture-source-" + suffix } })).toMatchObject({ selectedOutputAssetId: video.id, config: { assetId: video.id } });
      expect(await prisma.generationGraphNodeOutput.count({ where: { graphNodeId: "capture-source-" + suffix } })).toBe(0);
      const count = await prisma.mediaOperation.count({ where: { graphId: graph.id } });
      for (const capture of [
        { graphId: graph.id, sourceAssetId: video.id, timestampMs: 3000 },
        { graphId: "missing", sourceAssetId: video.id, timestampMs: 0 },
        { graphId: graph.id, sourceAssetId: sourceAssetId, timestampMs: 0 },
      ]) await expect(mediaAssetRepository.createUploadSession(ownerEmail, { ...base, videoCapture: capture }, presign(), BigInt(100000))).rejects.toBeInstanceOf(MediaOperationConflictError);
      await expect(mediaAssetRepository.createUploadSession("foreign-" + ownerEmail,
        { ...base, videoCapture: { graphId: graph.id, sourceAssetId: video.id, timestampMs: 0 } }, presign(), BigInt(100000))).rejects.toBeInstanceOf(MediaOperationConflictError);
      expect(await prisma.mediaOperation.count({ where: { graphId: graph.id } })).toBe(count);
      const expiring = await mediaAssetRepository.createUploadSession(ownerEmail, { ...base,
        videoCapture: { graphId: graph.id, sourceAssetId: video.id, timestampMs: 0 } }, presign(), BigInt(100000));
      uploads.push(expiring.id);
      await mediaAssetRepository.expireUploads(new Date(Date.now() + 120000), 100);
      expect(await mediaAssetRepository.getOperation(ownerEmail, expiring.operationId!)).toMatchObject({ status: "failed", outputs: [] });
      const failing = await mediaAssetRepository.createUploadSession(ownerEmail, { ...base,
        videoCapture: { graphId: graph.id, sourceAssetId: video.id, timestampMs: 1250 } }, presign(), BigInt(100000));
      uploads.push(failing.id);
      await mediaAssetRepository.failUpload(ownerEmail, failing.id, "MEDIA_UPLOAD_FAILED");
      expect(await mediaAssetRepository.getOperation(ownerEmail, failing.operationId!)).toMatchObject({ status: "failed", outputs: [] });
    } finally {
      await prisma.mediaUploadSession.deleteMany({ where: { id: { in: uploads } } });
      await prisma.mediaOperation.deleteMany({ where: { graphId: graph.id } });
      await prisma.generationGraph.delete({ where: { id: graph.id } });
    }
  });

  it("projects original audio text for list/detail and excludes a foreign parent generation", async () => {
    const { createMediaAssetService } = await import("./media-asset-service");
    const scripts = ["Native script.\n원래 TTS 대본입니다.", "Legacy spoken input", "Foreign private script"];
    const requestIds = scripts.map((_, index) => `audio-input-${suffix}-${index}`);
    const assetIds: string[] = [];
    const service = createMediaAssetService(mediaAssetRepository, {
      name: "leemage", assertAvailable() {}, presign: async () => { throw new Error("unexpected"); },
      confirm: async () => { throw new Error("unexpected"); }, inspect: async () => { throw new Error("unexpected"); },
      delete: async () => { throw new Error("unexpected"); }, resolveReadUrl: async () => { throw new Error("unexpected"); },
    });
    try {
      for (const [index, script] of scripts.entries()) {
        const result = await prisma.audioGeneration.create({ data: {
          ownerEmail: index === 2 ? `foreign-${ownerEmail}` : ownerEmail, requestId: requestIds[index],
          prompt: "Processed provider instructions", modelKey: "native-audio", status: "completed", progress: 100,
          requestParams: index === 0 ? {
            inputPrompt: "", promptFields: [], dynamicParams: { Script: script }, executionModel: {
              providerConfig: { gradio_contract: { version: 1, apiName: "/speak", inputs: [
                { name: "Script", label: "Script", kind: "string", schema: { type: "string" }, required: true, nullable: false },
              ], output: { media: "audio", path: [0], multiple: false }, diagnostics: [], reviewed: true } },
            },
          } : { inputPrompt: script },
          audios: { create: { url: "https://storage.example/audio-input.wav", asset: { create: {
            ownerEmail, type: "audio", origin: index === 1 ? "legacy_generation" : "generation", mimeType: "audio/wav",
            storageProvider: "leemage", storageObjectId: `audio-input-${suffix}-${index}`,
            storageUrl: "https://storage.example/audio-input.wav", durationMs: 1811,
          } } } },
        }, include: { audios: { select: { assetId: true } } } });
        assetIds.push(result.audios[0].assetId!);
      }
      const page = await service.list(ownerEmail, { type: "audio" });
      for (const [index, assetId] of assetIds.entries()) {
        const listed = page.items.find(item => item.id === assetId);
        expect(listed).toMatchObject({ inputPrompt: index === 2 ? null : scripts[index] });
        expect(await service.get(ownerEmail, assetId)).toEqual(listed);
      }
      const inputs = await mediaAssetRepository.listAudioGenerationInputs(ownerEmail, assetIds);
      expect(inputs.map(input => input.assetId).sort()).toEqual(assetIds.slice(0, 2).sort());
      expect(JSON.stringify(page.items.filter(item => assetIds.includes(item.id)))).not.toContain(scripts[2]);
      await expect(service.get(`foreign-${ownerEmail}`, assetIds[0])).rejects.toBeInstanceOf(MediaAssetNotFoundError);
    } finally {
      await prisma.audioGeneration.deleteMany({ where: { requestId: { in: requestIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: assetIds }, ownerEmail } });
    }
  });

  it("round-trips original and derived image roles without storage reads", async () => {
    const { createMediaAssetService } = await import("./media-asset-service");
    const imageVariants = {version: 1 as const, isAnimated: null, display: {url: "https://storage.example/display.webp", mimeType: "image/webp", bytes: 300, width: 1200, height: 800}, thumbnail: {url: "https://storage.example/thumb.webp", mimeType: "image/webp", bytes: 30, width: 480, height: 320}};
    const session = await mediaAssetRepository.createUploadSession(ownerEmail, {intendedType: "image", fileName: "original.png", declaredMimeType: "image/png", declaredBytes: 1000, sortOrder: 0}, {objectId: "image-" + suffix, objectName: "image.png", objectUrl: "https://storage.example/original.png", presignedUrl: "https://upload.example/image", expiresAt: new Date(Date.now()+60000)}, BigInt(100000));
    await mediaAssetRepository.claimUpload(ownerEmail, session.id, new Date());
    const asset = await mediaAssetRepository.completeUpload({ownerEmail, uploadId: session.id, confirmed: {objectId: "image-" + suffix, url: "https://storage.example/original.png", mimeType: "image/png", bytes: 1000, imageVariants}, inspected: {detectedMimeType: "image/png", width: 1200, height: 800, durationMs: null, isAnimated: false}, now: new Date()});
    expect(asset).toMatchObject({bytes: BigInt(1000), originalFileName: "original.png", folderId: null, starred: false, tagAssignments: [], imageVariants: {...imageVariants, isAnimated: false}});
    const service = createMediaAssetService(mediaAssetRepository, {name: "leemage", assertAvailable() {}, presign: async () => {throw new Error("unexpected");}, confirm: async () => {throw new Error("unexpected");}, inspect: async () => {throw new Error("unexpected");}, delete: async () => {throw new Error("unexpected");}, resolveReadUrl: async () => {throw new Error("Unexpected remote read");}} as Parameters<typeof createMediaAssetService>[1]);
    const page = await service.list(ownerEmail, {type: "image"});
    expect(page.items).toContainEqual(expect.objectContaining({id: asset.id, name: "original.png", originalFileName: "original.png", starred: false, tags: [], url: "https://storage.example/original.png", bytes: "1000", imageVariants: {...imageVariants, isAnimated: false}}));
    await prisma.mediaAsset.delete({where: {id: asset.id}});
    const {saveImageGenerationResult} = await import("@/server/image-generation/image-generation-repository");
    const generation = await prisma.imageGeneration.create({data: {ownerEmail, requestId: "f062-"+suffix, prompt: "test", status: "processing", progress: 10, modelKey: "test", requestParams: {}, aspectRatio: "1200x800", imageCount: 1, steps: 1}});
    try {
      await saveImageGenerationResult(generation.id, "completed", 100, undefined, undefined, [{type: "image", storageProvider: "leemage", storageObjectId: "generated-"+suffix, storageUrl: "https://storage.example/original.png", mimeType: "image/png", bytes: 1000, width: 1200, height: 800, durationMs: null, imageVariants}]);
      const result = await prisma.imageGenerationImage.findFirst({where: {generationId: generation.id}, include: {asset: true}});
      expect(result).toMatchObject({url: "https://storage.example/original.png", asset: {imageVariants, bytes: BigInt(1000)}});
    } finally {await prisma.imageGeneration.delete({where: {id: generation.id}}); await prisma.mediaAsset.deleteMany({where: {ownerEmail, storageObjectId: "generated-"+suffix}});}

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
    await prisma.generationInputAsset.create({
      data: {
        requestId: generationRequestId,
        generationType: "audio",
        ownerEmail,
        field: "inputAudio",
        sortOrder: 0,
        assetId: output.id,
      },
    });
    await expect(
      mediaAssetRepository.getAsset("other@example.com", output.id),
    ).rejects.toBeInstanceOf(MediaAssetNotFoundError);
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, output.id),
    ).resolves.toEqual({ graphIds: [graphId], operationIds: [], generationRequestIds: [generationRequestId], projectCoverIds: [], assistantExecutionIds: [] });
    await prisma.generationInputAsset.deleteMany({ where: { requestId: generationRequestId } });

    await prisma.generationGraph.delete({ where: { id: graphId } });
    await expect(
      prisma.mediaAsset.findUnique({ where: { id: output.id } }),
    ).resolves.toMatchObject({ id: output.id, sourceOperationId: operation.id });
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, output.id),
    ).resolves.toEqual({ graphIds: [], operationIds: [], generationRequestIds: [], projectCoverIds: [], assistantExecutionIds: [] });
    await expect(
      mediaAssetRepository.getAssetUsage(ownerEmail, sourceAssetId),
    ).resolves.toEqual({ graphIds: [], operationIds: [operation.id], generationRequestIds: [], projectCoverIds: [], assistantExecutionIds: [] });
  });
});
