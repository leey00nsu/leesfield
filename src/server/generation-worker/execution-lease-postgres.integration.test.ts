// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  claimPendingGenerationJobs,
  renewGenerationLease,
} from "@/server/generation-worker/execution-lease";
import { updateImageGenerationStatus } from "@/server/image-generation/image-generation-repository";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

const integration = describe.skipIf(!postgresIntegrationEnabled);

integration("generation execution leases", () => {
  const requestIds: string[] = [];
  const modelKeysToDelete: string[] = [];

  function requestId(label: string) {
    const id = `it-lease-${label}-${randomUUID()}`;
    requestIds.push(id);
    return id;
  }

  async function createPending(requestIdValue: string, modelKey: string) {
    return prisma.imageGeneration.create({
      data: {
        requestId: requestIdValue,
        ownerEmail: "it-execution-lease@example.com",
        prompt: "lease integration",
        requestParams: { model: modelKey },
        modelKey,
        status: "pending",
        progress: 0,
      },
    });
  }

  async function claim(
    modelKey: string,
    globalLimit = 100,
    modelLimit = 10,
    modelKeys = [modelKey],
  ) {
    return claimPendingGenerationJobs({
      mediaType: "image",
      modelKeys,
      defaultKey: modelKeys[0] ?? modelKey,
      getModelLimit: () => modelLimit,
      globalLimit,
    });
  }

  afterAll(async () => {
    if (requestIds.length > 0) {
      await prisma.imageGeneration.deleteMany({
        where: { requestId: { in: requestIds } },
      });
    }
    if (modelKeysToDelete.length > 0) {
      await prisma.modelCatalog.deleteMany({
        where: { key: { in: modelKeysToDelete } },
      });
    }
  });

  it("keeps the global and model execution limits under concurrent claims", async () => {
    const suffix = randomUUID();
    const modelKeys = [
      `it-lease-model-a-${suffix}`,
      `it-lease-model-b-${suffix}`,
    ];
    const rows = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createPending(requestId(`burst-${index}`), modelKeys[index % 2]!),
      ),
    );
    const activeBefore = await prisma.imageGeneration.count({
      where: {
        status: { in: ["processing", "uploading"] },
        executionLeaseToken: { not: null },
        executionLeaseUntil: { gt: new Date() },
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claim(modelKeys[0]!, activeBefore + 4, 2, modelKeys),
      ),
    );
    const claimed = results.flat();

    expect(claimed).toHaveLength(4);
    expect(new Set(claimed.map((record) => record.id)).size).toBe(4);
    expect(claimed.every((record) => record.executionLeaseToken)).toBe(true);
    expect(new Set(claimed.map((record) => record.executionLeaseVersion))).toEqual(new Set([1]));

    const firstLease = claimed[0]!;
    const leaseBefore = firstLease.executionLeaseUntil.getTime();
    await renewGenerationLease("image", firstLease.id, {
      token: firstLease.executionLeaseToken,
      version: firstLease.executionLeaseVersion,
    });
    const renewed = await prisma.imageGeneration.findUnique({
      where: { id: firstLease.id },
      select: { executionLeaseUntil: true },
    });
    expect(renewed?.executionLeaseUntil?.getTime()).toBeGreaterThan(leaseBefore);

    const activeAfter = await prisma.imageGeneration.count({
      where: {
        status: { in: ["processing", "uploading"] },
        executionLeaseToken: { not: null },
        executionLeaseUntil: { gt: new Date() },
      },
    });
    expect(activeAfter).toBe(activeBefore + 4);
    expect(rows).toHaveLength(10);
    await prisma.imageGeneration.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  });

  it("recovers legacy or expired executions and fences a late completion", async () => {
    const legacy = await prisma.imageGeneration.create({
      data: {
        requestId: requestId("legacy"),
        ownerEmail: "it-execution-lease@example.com",
        prompt: "legacy",
        status: "processing",
        progress: 92,
        requestParams: {},
        modelKey: "legacy-model",
      },
    });
    const cancelledLegacy = await prisma.imageGeneration.create({
      data: {
        requestId: requestId("legacy-cancelled"),
        ownerEmail: "it-execution-lease@example.com",
        prompt: "legacy cancelled",
        status: "uploading",
        progress: 95,
        cancelRequestedAt: new Date(),
        requestParams: {},
        modelKey: "legacy-model",
      },
    });
    const pending = await createPending(requestId("late"), "it-lease-late-model");
    const [claimed] = await claim("it-lease-late-model");
    expect(claimed?.id).toBe(pending.id);

    const lease = claimed;
    if (!lease) throw new Error("lease was not claimed");
    await prisma.imageGeneration.update({
      where: { id: lease.id },
      data: { executionLeaseUntil: new Date(Date.now() - 1_000) },
    });
    await claim("it-lease-late-model");

    await expect(
      prisma.imageGeneration.findUnique({ where: { id: legacy.id } }),
    ).resolves.toMatchObject({
      status: "failed",
      errorMessage: "EXECUTION_LEASE_RECOVERY_REQUIRED",
      executionLeaseToken: null,
    });
    await expect(
      prisma.imageGeneration.findUnique({ where: { id: cancelledLegacy.id } }),
    ).resolves.toMatchObject({ status: "cancelled", executionLeaseToken: null });
    await expect(
      prisma.imageGeneration.findUnique({ where: { id: lease.id } }),
    ).resolves.toMatchObject({
      status: "failed",
      errorMessage: "EXECUTION_LEASE_EXPIRED",
      executionLeaseToken: null,
    });

    await expect(
      updateImageGenerationStatus(lease.id, "completed", 100, undefined, {
        token: lease.executionLeaseToken,
        version: lease.executionLeaseVersion,
      }),
    ).rejects.toThrow("GENERATION_LEASE_LOST");
    await expect(
      renewGenerationLease("image", lease.id, {
        token: lease.executionLeaseToken,
        version: lease.executionLeaseVersion,
      }),
    ).rejects.toThrow("GENERATION_LEASE_LOST");
  });

  it("uses the current database model limit when the runtime cache is stale", async () => {
    const modelKey = "it-lease-config-" + randomUUID();
    modelKeysToDelete.push(modelKey);
    await prisma.modelCatalog.create({
      data: {
        type: "image",
        key: modelKey,
        label: "Lease config model",
        vendor: "test",
        provider: "hf_space",
        providerConfig: {},
        parameters: {},
        meta: { concurrent_limit: 1 },
        isActive: true,
      },
    });
    const rows = await Promise.all([
      createPending(requestId("config-1"), modelKey),
      createPending(requestId("config-2"), modelKey),
    ]);

    const first = await claim(modelKey, 100, 99, [modelKey]);
    expect(first).toHaveLength(1);

    await prisma.modelCatalog.update({
      where: { key: modelKey },
      data: { meta: { concurrent_limit: 2 } },
    });

    const second = await claim(modelKey, 100, 99, [modelKey]);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(2);

    await prisma.imageGeneration.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  });
});
