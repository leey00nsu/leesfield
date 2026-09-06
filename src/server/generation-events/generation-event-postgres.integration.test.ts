// @vitest-environment node

import { randomUUID } from "node:crypto";

import { Client, type Notification } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { getHistory } from "@/server/history/handlers/get-history";
import {
  GENERATION_EVENT_CHANNEL,
  parseGenerationEvent,
  type NodeExecutionUpdatedEvent,
} from "@/shared/generation-events/generation-event-contract";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

function waitForEvent(
  client: Client,
  requestId: string,
  timeoutMs = 3_000,
  matches: (event: NodeExecutionUpdatedEvent) => boolean = () => true,
) {
  return new Promise<NodeExecutionUpdatedEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener("notification", onNotification);
      reject(new Error(`Timed out waiting for ${requestId}`));
    }, timeoutMs);
    const onNotification = (notification: Notification) => {
      if (
        notification.channel !== GENERATION_EVENT_CHANNEL ||
        !notification.payload
      ) {
        return;
      }
      const event = parseGenerationEvent(notification.payload);
      if (
        !event ||
        event.type !== "node-execution.updated" ||
        event.executionId !== requestId ||
        !matches(event)
      ) return;
      clearTimeout(timeout);
      client.removeListener("notification", onNotification);
      resolve(event);
    };
    client.on("notification", onNotification);
  });
}

function expectNoEvent(client: Client, requestId: string, timeoutMs = 150) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener("notification", onNotification);
      resolve();
    }, timeoutMs);
    const onNotification = (notification: Notification) => {
      if (!notification.payload) return;
      const event = parseGenerationEvent(notification.payload);
      if (
        !event ||
        event.type !== "node-execution.updated" ||
        event.executionId !== requestId
      ) return;
      clearTimeout(timeout);
      client.removeListener("notification", onNotification);
      reject(new Error(`Unexpected event for ${requestId}`));
    };
    client.on("notification", onNotification);
  });
}

function waitForNodeExecutionEvent(
  client: Client,
  executionId: string,
  timeoutMs = 3_000,
  matches: (event: NodeExecutionUpdatedEvent) => boolean = () => true,
) {
  return new Promise<NodeExecutionUpdatedEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener("notification", onNotification);
      reject(new Error(`Timed out waiting for ${executionId}`));
    }, timeoutMs);
    const onNotification = (notification: Notification) => {
      if (
        notification.channel !== GENERATION_EVENT_CHANNEL ||
        !notification.payload
      ) return;
      const event = parseGenerationEvent(notification.payload);
      if (
        !event ||
        event.type !== "node-execution.updated" ||
        event.executionId !== executionId ||
        !matches(event)
      ) return;
      clearTimeout(timeout);
      client.removeListener("notification", onNotification);
      resolve(event);
    };
    client.on("notification", onNotification);
  });
}

integration("PostgreSQL Node execution notifications", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query(`LISTEN ${GENERATION_EVENT_CHANNEL}`);
  });

  afterAll(async () => {
    await client.query(`UNLISTEN ${GENERATION_EVENT_CHANNEL}`);
    await client.end();
  });

  it("publishes committed lifecycle changes and exposes completed images before notification", async () => {
    const suffix = randomUUID();
    const graphId = `f058-graph-${suffix}`;
    const nodeId = `f058-node-${suffix}`;
    const requestId = `f058-request-${suffix}`;
    const failedRequestId = `f058-failed-${suffix}`;
    const classicRequestId = `f058-classic-${suffix}`;

    try {
      await prisma.generationGraph.create({
        data: {
          id: graphId,
          ownerEmail: `f058-${suffix}@example.com`,
          title: "F058 integration",
          nodes: {
            create: {
              id: nodeId,
              kind: "generate.image",
              x: 0,
              y: 0,
              configVersion: 1,
              config: {},
            },
          },
        },
      });

      const pendingEvent = waitForEvent(client, requestId);
      const generation = await prisma.imageGeneration.create({
        data: {
          requestId,
          ownerEmail: `f058-${suffix}@example.com`,
          graphNodeId: nodeId,
          prompt: "integration",
          aspectRatio: "1024x1024",
          imageCount: 1,
          steps: 1,
          status: "pending",
          progress: 0,
        },
      });
      await expect(pendingEvent).resolves.toMatchObject({
        graphId,
        graphNodeId: nodeId,
        executionId: requestId,
        status: "pending",
        progress: 0,
      });

      const noOpEvent = expectNoEvent(client, requestId);
      await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: { status: "pending", progress: 0 },
      });
      await noOpEvent;

      const processingEvent = waitForEvent(
        client,
        requestId,
        3_000,
        (event) => event.status === "processing" && event.progress === 10,
      );
      await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: { status: "processing", progress: 10 },
      });
      await expect(processingEvent).resolves.toMatchObject({
        status: "processing",
        progress: 10,
      });

      const completedEvent = waitForEvent(
        client,
        requestId,
        3_000,
        (event) => event.status === "completed" && event.progress === 100,
      );
      await prisma.$transaction([
        prisma.imageGeneration.update({
          where: { id: generation.id },
          data: { status: "completed", progress: 100 },
        }),
        prisma.imageGenerationImage.create({
          data: {
            generationId: generation.id,
            url: "https://example.com/f058.png",
            width: 1024,
            height: 1024,
          },
        }),
      ]);
      await expect(completedEvent).resolves.toMatchObject({
        status: "completed",
        progress: 100,
      });
      await expect(
        prisma.imageGeneration.findUnique({
          where: { id: generation.id },
          include: { images: true },
        }),
      ).resolves.toMatchObject({
        status: "completed",
        images: [{ url: "https://example.com/f058.png" }],
      });

      const failedPendingEvent = waitForEvent(client, failedRequestId);
      const failedGeneration = await prisma.imageGeneration.create({
        data: {
          requestId: failedRequestId,
          ownerEmail: `f058-${suffix}@example.com`,
          graphNodeId: nodeId,
          prompt: "failed integration",
          aspectRatio: "1024x1024",
          imageCount: 1,
          steps: 1,
          status: "pending",
          progress: 0,
        },
      });
      await failedPendingEvent;
      const failedEvent = waitForEvent(
        client,
        failedRequestId,
        3_000,
        (event) => event.status === "failed",
      );
      await prisma.imageGeneration.update({
        where: { id: failedGeneration.id },
        data: { status: "failed", progress: 0, errorMessage: "EXPECTED_FAILURE" },
      });
      await expect(failedEvent).resolves.toMatchObject({
        status: "failed",
        progress: 0,
      });

      const relationRemovalEvent = expectNoEvent(client, requestId);
      await prisma.generationGraph.delete({ where: { id: graphId } });
      await relationRemovalEvent;
      await expect(
        prisma.imageGeneration.findUnique({ where: { id: generation.id } }),
      ).resolves.toMatchObject({ graphNodeId: null, status: "completed" });

      const classicEvent = expectNoEvent(client, classicRequestId);
      await prisma.imageGeneration.create({
        data: {
          requestId: classicRequestId,
          ownerEmail: `f058-${suffix}@example.com`,
          prompt: "classic",
          aspectRatio: "1024x1024",
          imageCount: 1,
          steps: 1,
          status: "pending",
          progress: 0,
        },
      });
      await classicEvent;
    } finally {
      await prisma.imageGeneration.deleteMany({
        where: {
          requestId: { in: [requestId, failedRequestId, classicRequestId] },
        },
      });
      await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    }
  });

  it("publishes v2 events for all generation media and completed MediaOperation assets", async () => {
    const suffix = randomUUID();
    const ownerEmail = `f059-${suffix}@example.com`;
    const graphId = `f059-graph-${suffix}`;
    const imageNodeId = `f059-image-${suffix}`;
    const videoNodeId = `f059-video-${suffix}`;
    const audioNodeId = `f059-audio-${suffix}`;
    const editNodeId = `f059-edit-${suffix}`;
    const imageRequestId = `f059-image-request-${suffix}`;
    const videoRequestId = `f059-video-request-${suffix}`;
    const audioRequestId = `f059-audio-request-${suffix}`;
    const operationId = `f059-operation-${suffix}`;
    let assetId: string | null = null;

    try {
      await prisma.generationGraph.create({
        data: {
          id: graphId,
          ownerEmail,
          title: "F059 event integration",
          schemaVersion: 2,
          minimumWriterVersion: 2,
          nodes: {
            create: [
              { id: imageNodeId, kind: "generate.image", x: 0, y: 0, configVersion: 1, config: {} },
              { id: videoNodeId, kind: "generate.video", x: 100, y: 0, configVersion: 1, config: {} },
              { id: audioNodeId, kind: "generate.audio", x: 200, y: 0, configVersion: 1, config: {} },
              { id: editNodeId, kind: "edit.audio.basic", x: 300, y: 0, configVersion: 1, config: {} },
            ],
          },
        },
      });

      const imageEvent = waitForNodeExecutionEvent(client, imageRequestId);
      await prisma.imageGeneration.create({
        data: {
          requestId: imageRequestId,
          ownerEmail,
          graphNodeId: imageNodeId,
          prompt: "image",
          aspectRatio: "1024x1024",
          imageCount: 1,
          steps: 1,
          status: "pending",
          progress: 0,
        },
      });
      await expect(imageEvent).resolves.toMatchObject({
        executionKind: "generation",
        mediaType: "image",
        graphId,
        graphNodeId: imageNodeId,
        status: "pending",
      });

      const videoEvent = waitForNodeExecutionEvent(client, videoRequestId);
      await prisma.videoGeneration.create({
        data: {
          requestId: videoRequestId,
          ownerEmail,
          graphNodeId: videoNodeId,
          prompt: "video",
          status: "processing",
          progress: 25,
        },
      });
      await expect(videoEvent).resolves.toMatchObject({
        executionKind: "generation",
        mediaType: "video",
        graphNodeId: videoNodeId,
        status: "processing",
        progress: 25,
      });

      const audioEvent = waitForNodeExecutionEvent(client, audioRequestId);
      await prisma.audioGeneration.create({
        data: {
          requestId: audioRequestId,
          ownerEmail,
          graphNodeId: audioNodeId,
          prompt: "audio",
          status: "uploading",
          progress: 95,
        },
      });
      await expect(audioEvent).resolves.toMatchObject({
        executionKind: "generation",
        mediaType: "audio",
        graphNodeId: audioNodeId,
        status: "uploading",
        progress: 95,
      });

      const pendingOperationEvent = waitForNodeExecutionEvent(
        client,
        operationId,
        3_000,
        (event) => event.status === "pending",
      );
      const operation = await prisma.mediaOperation.create({
        data: {
          id: operationId,
          ownerEmail,
          graphId,
          graphNodeId: editNodeId,
          type: "edit.audio.basic",
          configVersion: 1,
          parameters: {},
          status: "pending",
          progress: 0,
        },
      });
      await expect(pendingOperationEvent).resolves.toMatchObject({
        executionKind: "media_operation",
        mediaType: "audio",
        graphId,
        graphNodeId: editNodeId,
        status: "pending",
        progress: 0,
      });

      const processingOperationEvent = waitForNodeExecutionEvent(
        client,
        operation.id,
        3_000,
        (event) => event.status === "processing",
      );
      await prisma.mediaOperation.update({
        where: { id: operation.id },
        data: { status: "processing", progress: 20 },
      });
      await expect(processingOperationEvent).resolves.toMatchObject({
        status: "processing",
        progress: 20,
      });

      const uploadingOperationEvent = waitForNodeExecutionEvent(
        client,
        operation.id,
        3_000,
        (event) => event.status === "uploading",
      );
      await prisma.mediaOperation.update({
        where: { id: operation.id },
        data: { status: "uploading", progress: 95 },
      });
      await expect(uploadingOperationEvent).resolves.toMatchObject({
        status: "uploading",
        progress: 95,
      });

      const completedEvent = waitForNodeExecutionEvent(
        client,
        operation.id,
        3_000,
        (event) => event.status === "completed",
      );
      const committed = await prisma.$transaction(async (tx) => {
        await tx.mediaOperation.update({
          where: { id: operation.id },
          data: { status: "completed", progress: 100, completedAt: new Date() },
        });
        const asset = await tx.mediaAsset.create({
          data: {
            ownerEmail,
            type: "audio",
            status: "completed",
            origin: "media_operation",
            storageProvider: "integration",
            storageObjectId: `f059-audio-${suffix}`,
            storageUrl: "https://example.com/f059.wav",
            mimeType: "audio/wav",
            bytes: 1_024,
            durationMs: 1_000,
            sourceOperationId: operation.id,
          },
        });
        await tx.generationGraphNodeOutput.create({
          data: {
            graphNodeId: editNodeId,
            portId: "audio",
            assetId: asset.id,
            sortOrder: 0,
          },
        });
        return asset;
      });
      assetId = committed.id;

      await expect(completedEvent).resolves.toMatchObject({
        executionKind: "media_operation",
        mediaType: "audio",
        graphId,
        graphNodeId: editNodeId,
        executionId: operation.id,
        status: "completed",
        progress: 100,
      });
      await expect(
        prisma.generationGraphNodeOutput.findFirst({
          where: { graphNodeId: editNodeId, assetId: committed.id },
          include: { asset: true },
        }),
      ).resolves.toMatchObject({
        asset: {
          status: "completed",
          origin: "media_operation",
          mimeType: "audio/wav",
          sourceOperationId: operation.id,
        },
      });
      await expect(
        getHistory(new URLSearchParams({ type: "audio" }), ownerEmail),
      ).resolves.toEqual(
        expect.objectContaining({
          items: expect.arrayContaining([
          expect.objectContaining({
            id: operation.id,
            origin: "edit",
            assetId: committed.id,
            graphId,
            graphNodeId: editNodeId,
            status: "completed",
          }),
          ]),
        }),
      );
    } finally {
      await prisma.generationGraphNodeOutput.deleteMany({
        where: { graphNodeId: { in: [imageNodeId, videoNodeId, audioNodeId, editNodeId] } },
      });
      if (assetId) await prisma.mediaAsset.deleteMany({ where: { id: assetId } });
      await prisma.mediaOperation.deleteMany({ where: { id: operationId } });
      await prisma.imageGeneration.deleteMany({ where: { requestId: imageRequestId } });
      await prisma.videoGeneration.deleteMany({ where: { requestId: videoRequestId } });
      await prisma.audioGeneration.deleteMany({ where: { requestId: audioRequestId } });
      await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    }
  });
});
