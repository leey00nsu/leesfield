import { createHmac } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/server/runtime/env";
import {
  QueueContractError, queueJobKinds, queueResourceSchema, queueSourceSchema,
} from "./contracts";
import { assertQueueSource, queueKindDefinition } from "./job-kind-registry";
import { queueDatabaseNow, type QueueTransaction } from "./job-queue-transaction";
import { markQueueWorkTx } from "./job-queue-wakeup";

const registrationSchema = z.object({
  kind: z.enum(queueJobKinds),
  source: queueSourceSchema,
  ownerScopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotRef: z.string().min(1).max(400),
  resources: z.array(queueResourceSchema).max(16).default([]),
  orderKey: z.string().trim().min(1).max(200).optional(),
  availableAt: z.date().optional(),
  suspended: z.boolean().default(false),
}).strict();

export type RegisterQueueJob = z.input<typeof registrationSchema>;

export function queueScopeDigest(scope: string) {
  return createHmac("sha256", getServerEnv().sessionPassword).update("queue-scope|" + scope).digest("hex");
}

/** Caller owns the transaction and must acquire the queue lock first. */
export async function enqueueQueueJobTx(tx: QueueTransaction, raw: RegisterQueueJob) {
  const input = registrationSchema.parse(raw);
  assertQueueSource(input.kind, input.source.type);
  const runtime = await tx.queueRuntime.findUnique({ where: { id: 1 } });
  // Pausing stops execution admission and dispatch, while already-running work
  // must still persist upload protection, result links and orphan cleanup.
  if (!runtime || runtime.mode !== "shared" && input.kind !== "storage_cleanup")
    throw new QueueContractError("QUEUE_PAUSED");
  const identity = {
    kind: input.kind, sourceType: input.source.type,
    sourceId: input.source.id, sourceRevision: input.source.revision,
  };
  const existing = await tx.queueJob.findUnique({ where: { kind_sourceType_sourceId_sourceRevision: identity } });
  if (existing) {
    if (existing.ownerScopeDigest !== input.ownerScopeDigest || existing.snapshotRef !== input.snapshotRef) {
      throw new QueueContractError("QUEUE_IDENTITY_CONFLICT");
    }
    return existing;
  }
  let orderGroupId: string | undefined;
  let sequence: bigint | undefined;
  if (input.orderKey) {
    const group = await tx.queueOrderGroup.upsert({
      where: { ownerScopeDigest_opaqueKey: { ownerScopeDigest: input.ownerScopeDigest, opaqueKey: input.orderKey } },
      create: { ownerScopeDigest: input.ownerScopeDigest, opaqueKey: input.orderKey },
      update: {},
    });
    if (group.closedAt) throw new QueueContractError("QUEUE_GROUP_CLOSED");
    orderGroupId = group.id;
    sequence = group.nextSequence;
    await tx.queueOrderGroup.update({ where: { id: group.id }, data: { nextSequence: { increment: 1 } } });
  }
  const definition = queueKindDefinition(input.kind);
  const requirements = [
    { type: "static" as const, key: definition.pool, capacity: definition.capacity },
    ...input.resources,
  ];
  const keys = new Set<string>();
  for (const r of requirements.sort((a, b) => a.key.localeCompare(b.key))) {
    if (keys.has(r.key)) throw new QueueContractError("QUEUE_RESOURCE_DUPLICATE");
    keys.add(r.key);
    const policy = r.type === "static"
      ? { staticCapacity: r.capacity, modelKey: null, modelType: null }
      : { staticCapacity: null, modelKey: r.modelKey, modelType: r.modelType };
    const stored = await tx.queueResource.upsert({ where: { key: r.key }, create: { key: r.key, ...policy }, update: {} });
    if (stored.staticCapacity !== policy.staticCapacity || stored.modelKey !== policy.modelKey || stored.modelType !== policy.modelType) {
      throw new QueueContractError("QUEUE_RESOURCE_POLICY_CONFLICT");
    }
  }
  if (!input.suspended) markQueueWorkTx(tx);
  return tx.queueJob.create({ data: {
    ...identity, ownerScopeDigest: input.ownerScopeDigest, snapshotRef: input.snapshotRef,
    executionType: input.source.type, executionId: input.source.id,
    orderGroupId, sequence, availableAt: input.availableAt ?? await queueDatabaseNow(tx),
    status: input.suspended ? "suspended" : "ready",
    maxAttempts: definition.maxAttempts, retryDelayMs: definition.retryDelayMs,
    resources: { create: [...keys].map(resourceKey => ({ resourceKey })) },
  } });
}
