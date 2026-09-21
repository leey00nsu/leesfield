// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

import {
  beginSubmission,
  finalizeSubmission,
  hashSubmissionPayload,
  setSubmissionLedgerForTests,
} from "./submission-ledger";

const integration = describe.skipIf(!postgresIntegrationEnabled);

integration("generation submission ledger", () => {
  const createdRequestIds: string[] = [];
  const createdModelKeys: string[] = [];

  // The shared setup installs an in-memory ledger; this suite proves the SQL one.
  setSubmissionLedgerForTests(null);

  function requestIdFor(label: string): string {
    const id = "it-" + label + "-" + randomUUID();
    createdRequestIds.push(id);
    return id;
  }

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await prisma.generationSubmission.deleteMany({
        where: { requestId: { in: createdRequestIds } },
      });
    }
    if (createdModelKeys.length > 0) {
      await prisma.modelCatalog.deleteMany({
        where: { key: { in: createdModelKeys } },
      });
    }
  });

  it("converges concurrent retries of one key onto a single reservation", async () => {
    const ownerEmail = "it-ledger-" + randomUUID() + "@example.com";
    const payloadHash = hashSubmissionPayload({ prompt: "same", steps: 20 });
    const requestIds = Array.from({ length: 10 }, () =>
      requestIdFor("burst"),
    );

    const results = await Promise.all(
      requestIds.map((requestId) =>
        beginSubmission({
          requestId,
          ownerEmail,
          idempotencyKey: "retry-token",
          payloadHash,
          providerKey: "it-model",
        }),
      ),
    );

    const created = results.filter((result) => result.kind === "created");
    const existing = results.filter((result) => result.kind === "existing");
    expect(created).toHaveLength(1);
    expect(existing).toHaveLength(9);
    const reservation = created[0];
    if (reservation?.kind !== "created") throw new Error("unreachable");
    for (const result of existing) {
      expect(result).toMatchObject({
        kind: "existing",
        requestId: reservation.requestId,
        state: "preparing",
      });
    }

    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });

  it("rejects the same key with different inputs", async () => {
    const ownerEmail = "it-ledger-" + randomUUID() + "@example.com";
    const first = requestIdFor("first");
    await beginSubmission({
      requestId: first,
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash: hashSubmissionPayload({ prompt: "one" }),
    });

    const second = await beginSubmission({
      requestId: requestIdFor("second"),
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash: hashSubmissionPayload({ prompt: "two" }),
    });

    expect(second).toMatchObject({ kind: "conflict", requestId: first });
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });

  it("lets only one concurrent retry reclaim a failed reservation", async () => {
    const ownerEmail = "it-ledger-retry-" + randomUUID() + "@example.com";
    const payloadHash = hashSubmissionPayload({ prompt: "retry" });
    const first = requestIdFor("failed-retry");
    await beginSubmission({
      requestId: first,
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash,
    });
    await finalizeSubmission(first, "failed");

    const retries = await Promise.all(
      Array.from({ length: 10 }, () =>
        beginSubmission({
          requestId: requestIdFor("retry-candidate"),
          ownerEmail,
          idempotencyKey: "retry-token",
          payloadHash,
        }),
      ),
    );

    expect(retries.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(retries.filter((result) => result.kind === "existing")).toHaveLength(9);
    expect(
      retries.every(
        (result) => "requestId" in result && result.requestId === first,
      ),
    ).toBe(true);
    expect(
      retries
        .filter((result) => result.kind === "existing")
        .every((result) => result.state === "preparing"),
    ).toBe(true);
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });

  it("enforces the owner queue budget before any provider work", async () => {
    const ownerEmail = "it-ledger-" + randomUUID() + "@example.com";
    const limits = { ownerPending: 2, globalPending: 1000 };

    const first = await beginSubmission({
      requestId: requestIdFor("limit-1"),
      ownerEmail,
      idempotencyKey: "key-1",
      payloadHash: hashSubmissionPayload({ n: 1 }),
      limits,
    });
    const second = await beginSubmission({
      requestId: requestIdFor("limit-2"),
      ownerEmail,
      idempotencyKey: "key-2",
      payloadHash: hashSubmissionPayload({ n: 2 }),
      limits,
    });
    const third = await beginSubmission({
      requestId: requestIdFor("limit-3"),
      ownerEmail,
      idempotencyKey: "key-3",
      payloadHash: hashSubmissionPayload({ n: 3 }),
      limits,
    });

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    expect(third).toMatchObject({ kind: "rejected", reason: "OWNER_LIMIT" });
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });

  it("reclaims an expired reservation and reports the finalized state", async () => {
    const ownerEmail = "it-ledger-" + randomUUID() + "@example.com";
    const payloadHash = hashSubmissionPayload({ prompt: "reclaim" });
    const first = requestIdFor("expiring");

    const started = await beginSubmission({
      requestId: first,
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash,
      limits: { reservationTtlMs: 1 },
    });
    expect(started.kind).toBe("created");

    const resumed = await beginSubmission({
      requestId: requestIdFor("after-expiry"),
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash,
    });
    expect(resumed.kind).toBe("created");

    await finalizeSubmission(
      resumed.kind === "created" ? resumed.requestId : "missing",
      "submitted",
    );
    const repeat = await beginSubmission({
      requestId: requestIdFor("after-finalize"),
      ownerEmail,
      idempotencyKey: "retry-token",
      payloadHash,
    });
    expect(repeat).toMatchObject({
      kind: "existing",
      state: "submitted",
      requestId: resumed.kind === "created" ? resumed.requestId : undefined,
    });

    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });

  it("rejects a new reservation when the authoritative model is inactive", async () => {
    const modelKey = "it-admission-model-" + randomUUID();
    const ownerEmail = "it-ledger-model-" + randomUUID() + "@example.com";
    createdModelKeys.push(modelKey);
    await prisma.modelCatalog.create({
      data: {
        type: "image",
        key: modelKey,
        label: "Admission model",
        vendor: "test",
        provider: "hf_space",
        providerConfig: {},
        parameters: {},
        meta: { concurrent_limit: 1 },
        isActive: true,
      },
    });

    const first = await beginSubmission({
      requestId: requestIdFor("active-model"),
      ownerEmail,
      payloadHash: hashSubmissionPayload({ modelKey, attempt: 1 }),
      modelKey,
      modelType: "image",
    });
    expect(first.kind).toBe("created");

    await prisma.modelCatalog.update({
      where: { key: modelKey },
      data: { isActive: false },
    });

    const blocked = await beginSubmission({
      requestId: requestIdFor("inactive-model"),
      ownerEmail,
      payloadHash: hashSubmissionPayload({ modelKey, attempt: 2 }),
      modelKey,
      modelType: "image",
    });
    expect(blocked).toMatchObject({ kind: "model-unavailable" });

    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
  });
});
