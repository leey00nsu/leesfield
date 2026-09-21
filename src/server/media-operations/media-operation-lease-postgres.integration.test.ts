// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import {
  renewMediaOperationLease,
  type MediaOperationLease,
} from "@/server/media-operations/media-operation-lease";

const integration = describe.skipIf(!postgresIntegrationEnabled);

integration("media operation execution leases", () => {
  const ownerEmail = `it-media-operation-lease-${randomUUID()}@example.com`;
  const operationIds: string[] = [];

  async function createOperation(
    status: "pending" | "processing" | "uploading",
    type = "edit.image.removeBackground",
  ) {
    const operation = await prisma.mediaOperation.create({
      data: {
        ownerEmail,
        type,
        configVersion: 1,
        parameters: {},
        status,
        progress: status === "pending" ? 0 : 10,
      },
    });
    operationIds.push(operation.id);
    return operation;
  }

  afterEach(async () => {
    if (operationIds.length > 0) {
      await prisma.mediaOperation.deleteMany({
        where: { id: { in: operationIds } },
      });
      operationIds.length = 0;
    }
  });

  it("keeps the shared server-operation limit under concurrent claims", async () => {
    const rows = await Promise.all(
      Array.from({ length: 5 }, () => createOperation("pending")),
    );
    const results = await Promise.all(
      rows.map((operation) =>
        mediaAssetRepository.claimPendingServerOperation(operation.id),
      ),
    );
    const claimed = results.filter((result): result is NonNullable<typeof result> => Boolean(result));

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map(({ operation }) => operation.id)).size).toBe(2);
    expect(
      claimed.every(({ operation, lease }) =>
        operation.executionLeaseToken === lease.token &&
        operation.executionLeaseVersion === 1,
      ),
    ).toBe(true);
    const active = await prisma.mediaOperation.count({
      where: {
        ownerEmail,
        status: { in: ["processing", "uploading"] },
        executionLeaseToken: { not: null },
        executionLeaseUntil: { gt: new Date() },
      },
    });
    expect(active).toBe(2);
  });

  it("recovers legacy or expired work and fences late writes", async () => {
    const legacy = await createOperation("processing");
    const pending = await createOperation("pending");
    const claimed = await mediaAssetRepository.claimPendingServerOperation(pending.id);
    expect(claimed).not.toBeNull();
    if (!claimed) throw new Error("operation was not claimed");

    const oldLease: MediaOperationLease = claimed.lease;
    await prisma.mediaOperation.update({
      where: { id: pending.id },
      data: { executionLeaseUntil: new Date(Date.now() - 1_000) },
    });
    const next = await createOperation("pending");
    await mediaAssetRepository.claimPendingServerOperation(next.id);

    await expect(
      prisma.mediaOperation.findUnique({ where: { id: legacy.id } }),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "MEDIA_OPERATION_LEASE_RECOVERY_REQUIRED",
      executionLeaseToken: null,
    });
    await expect(
      prisma.mediaOperation.findUnique({ where: { id: pending.id } }),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "MEDIA_OPERATION_LEASE_EXPIRED",
      executionLeaseToken: null,
    });
    await expect(
      mediaAssetRepository.failOperation(
        ownerEmail,
        pending.id,
        "LATE_FAILURE",
        oldLease,
      ),
    ).rejects.toThrow("MEDIA_OPERATION_LEASE_LOST");
    await expect(
      mediaAssetRepository.completeServerOperation(
        ownerEmail,
        pending.id,
        [],
        new Date(),
        oldLease,
      ),
    ).rejects.toThrow("MEDIA_OPERATION_LEASE_LOST");
    await expect(renewMediaOperationLease(pending.id, oldLease)).rejects.toThrow(
      "MEDIA_OPERATION_LEASE_LOST",
    );
  });
});
