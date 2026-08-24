// @vitest-environment node

import { randomUUID } from "node:crypto";

import { Client, type Notification } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  GENERATION_EVENT_CHANNEL,
  parseGenerationEvent,
  type GenerationUpdatedEvent,
} from "@/shared/generation-events/generation-event-contract";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

function waitForEvent(
  client: Client,
  requestId: string,
  timeoutMs = 3_000,
) {
  return new Promise<GenerationUpdatedEvent>((resolve, reject) => {
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
      if (!event || event.requestId !== requestId) return;
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
      if (!event || event.requestId !== requestId) return;
      clearTimeout(timeout);
      client.removeListener("notification", onNotification);
      reject(new Error(`Unexpected event for ${requestId}`));
    };
    client.on("notification", onNotification);
  });
}

integration("PostgreSQL Node Generation notifications", () => {
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
              type: "imageGeneration",
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
        requestId,
        status: "pending",
        progress: 0,
      });

      const noOpEvent = expectNoEvent(client, requestId);
      await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: { status: "pending", progress: 0 },
      });
      await noOpEvent;

      const processingEvent = waitForEvent(client, requestId);
      await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: { status: "processing", progress: 10 },
      });
      await expect(processingEvent).resolves.toMatchObject({
        status: "processing",
        progress: 10,
      });

      const completedEvent = waitForEvent(client, requestId);
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
      const failedEvent = waitForEvent(client, failedRequestId);
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
});
