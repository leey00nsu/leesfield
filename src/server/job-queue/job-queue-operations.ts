import { randomUUID } from "node:crypto";
import { Prisma, type QueueAdminAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { hashSubmissionPayload } from "@/server/generation-admission/submission-ledger";
import { logSafeError } from "@/server/observability/request-observability";
import { QueueContractError } from "./contracts";
import { queueScopeDigest } from "./job-queue-registration";
import { queueDatabaseNow, withQueueTransaction } from "./job-queue-transaction";
import { cloneQueueSourceTx, prepareQueueRedrive } from "./job-queue-redrive-source";
import { releaseQueueReservationsTx } from "./job-queue-settlement";
import { requestQueueCancellationTx } from "./job-queue-recovery";
import { inspectQueueRemoteEvidence } from "./job-queue-reconciliation";
import { markQueueWorkTx } from "./job-queue-wakeup";

export const queueOperatorInputSchema = z.object({
  requestId: z.string().uuid(), expectedVersion: z.number().int().min(0),
  reason: z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/),
  evidenceRef: z.string().min(1).max(400).regex(/^[a-zA-Z0-9_:.-]+$/).optional(),
}).strict();
export type QueueOperatorInput = z.infer<typeof queueOperatorInputSchema>;
export type QueueOperation = "redrive" | "reconcile" | "abandon" | "cancel_group";
function conflict(code: string): never { throw new QueueContractError(code); }
const result = (a: QueueAdminAction) => ({ requestId: a.requestId, action: a.action, outcome: a.outcome, result: a.after });

export async function auditQueueRejection(actor: string, action: QueueOperation, reason: string, requestId = randomUUID()) {
  try {
    await prisma.queueAdminAction.create({ data: { requestId, requestFingerprint: hashSubmissionPayload({ action, reason }),
      actorDigest: queueScopeDigest(actor), action, safeReason: reason, outcome: "rejected" } });
  } catch (error) {
    logSafeError("queue.audit.failed", error, { worker: "shared-queue", phase: "admin.audit" });
  }
}

async function cancelSourceTx(tx: Prisma.TransactionClient, executionType: string, id: string, active: boolean) {
  if (executionType === "media_operation") {
    await tx.mediaOperation.updateMany({ where: { id, status: { in: ["pending", "processing", "uploading"] } }, data: { status: "cancelled", finishedAt: new Date() } });
  } else if (executionType === "assistant_execution") {
    await tx.assistantExecution.updateMany({ where: { id, status: { in: ["pending", "processing"] } },
      data: active ? { cancelRequestedAt: new Date() } : { status: "cancelled", finishedAt: new Date() } });
  } else if (executionType === "storage_cleanup") {
    if (!active) await tx.mediaCleanupTask.updateMany({ where: { id, status: { in: ["pending", "uploading", "linked"] } },
      data: { status: "failed", lastError: "QUEUE_CANCELLED" } });
  } else {
    const model = (executionType === "image_generation" ? tx.imageGeneration : executionType === "video_generation" ? tx.videoGeneration : tx.audioGeneration) as Prisma.TransactionClient["imageGeneration"];
    await model.updateMany({ where: { id, status: { in: ["pending", "processing", "uploading"] } },
      data: active ? { cancelRequestedAt: new Date() } : { status: "cancelled", finishedAt: new Date() } });
  }
}

/** Internal trusted service; HTTP authentication lives in job-queue-admin-http. */
export async function operateQueue(actor: string, action: QueueOperation, targetId: string, raw: unknown) {
  const input = queueOperatorInputSchema.parse(raw);
  z.string().uuid().parse(targetId);
  const fingerprint = hashSubmissionPayload({ actor: queueScopeDigest(actor), action, targetId, ...input });
  const existing = await prisma.queueAdminAction.findUnique({ where: { requestId: input.requestId } });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      await auditQueueRejection(actor, action, "QUEUE_REQUEST_ID_CONFLICT");
      conflict("QUEUE_REQUEST_ID_CONFLICT");
    }
    return result(existing);
  }
  let preparedError: unknown;
  if (action === "redrive") {
    const entry = await prisma.queueDeadLetter.findUnique({ where: { id: targetId }, include: { job: true } });
    if (entry) try { await prepareQueueRedrive(entry.job); } catch (error) { preparedError = error; }
  }
  let reserved: QueueAdminAction;
  try {
    reserved = await withQueueTransaction(async tx => {
      const duplicate = await tx.queueAdminAction.findUnique({ where: { requestId: input.requestId } });
      if (duplicate) {
        if (duplicate.requestFingerprint !== fingerprint) conflict("QUEUE_REQUEST_ID_CONFLICT");
        return duplicate;
      }
      if (action === "cancel_group") {
        const group = await tx.queueOrderGroup.findUnique({ where: { id: targetId } });
        if (!group || group.version !== input.expectedVersion) conflict("QUEUE_VERSION_CONFLICT");
        await tx.queueOrderGroup.update({ where: { id: group.id }, data: { closedAt: group.closedAt ?? new Date(), version: { increment: 1 } } });
        const pending = await tx.queueJob.findMany({ where: { orderGroupId: group.id,
          status: { in: ["ready", "retry_wait", "suspended", "active", "reconciliation_required"] } },
          orderBy: { sequence: "asc" }, take: 100 });
        for (const job of pending) {
          await requestQueueCancellationTx(tx, job.id);
          await cancelSourceTx(tx, job.executionType, job.executionId, job.status === "active" || job.status === "reconciliation_required");
        }
        return tx.queueAdminAction.create({ data: { requestId: input.requestId, requestFingerprint: fingerprint,
          actorDigest: queueScopeDigest(actor), action, expectedVersion: input.expectedVersion, safeReason: input.reason,
          before: { groupId: group.id, version: group.version }, after: { closed: true, requested: pending.length }, outcome: "succeeded" } });
      }
      const entry = await tx.queueDeadLetter.findUnique({ where: { id: targetId }, include: { job: true, failedAttempt: true } });
      if (!entry || entry.version !== input.expectedVersion ||
        (entry.state !== "open" && !(action === "reconcile" && entry.state === "abandoned"))) conflict("QUEUE_VERSION_CONFLICT");
      const job = entry.job;
      if (action === "redrive" && preparedError) throw preparedError;
      if (action === "redrive" && (await tx.queueRuntime.findUnique({ where: { id: 1 } }))?.mode !== "shared") conflict("QUEUE_PAUSED");
      if (job.status !== "dead_letter" && job.status !== "reconciliation_required" &&
        !(action === "reconcile" && job.status === "abandoned")) conflict("QUEUE_JOB_NOT_FAILED");
      const before = { status: job.status, cycle: job.cycle, executionId: job.executionId, version: entry.version };
      let after: Prisma.InputJsonObject = {};
      if (action === "redrive") {
        if (entry.classification !== "terminal" || job.status === "reconciliation_required" ||
          await tx.queueReservation.count({ where: { attempt: { jobId: job.id }, releasedAt: null } })) conflict("QUEUE_REMOTE_STOP_NOT_CONFIRMED");
        if (job.cancelRequestedAt) conflict("QUEUE_JOB_CANCEL_REQUESTED");
        if (job.orderGroupId && (await tx.queueOrderGroup.findUnique({ where: { id: job.orderGroupId } }))?.closedAt) conflict("QUEUE_GROUP_CLOSED");
        const detail = entry.detail as { reconciliation?: { status?: string; requestId?: string; jobId?: string } } | null;
        const previous = await tx.queueAdminAction.findFirst({ where: { jobId: job.id, action: "redrive", outcome: "succeeded" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        const oldMode = previous?.after as Prisma.JsonObject | null;
        const collection = detail?.reconciliation?.status === "completed" ? detail.reconciliation
          : oldMode?.mode === "collect" ? { requestId: oldMode.collectionRequestId, jobId: oldMode.collectionJobId } : null;
        const executionId = await cloneQueueSourceTx(tx, job);
        after = { cycle: job.cycle + 1, executionId, mode: collection ? "collect" : "execute",
          ...(collection ? { collectionRequestId: collection.requestId!, collectionJobId: collection.jobId! } : {}) };
        await tx.queueJob.update({ where: { id: job.id }, data: { executionId, cycle: { increment: 1 },
          status: "ready", currentAttemptId: null, availableAt: new Date(), version: { increment: 1 } } });
        markQueueWorkTx(tx);
        await tx.queueDeadLetter.update({ where: { id: entry.id }, data: { state: "redriven", version: { increment: 1 } } });
        if (job.orderGroupId) await tx.queueOrderGroup.update({ where: { id: job.orderGroupId }, data: { blockedByJobId: null, version: { increment: 1 } } });
      } else if (action === "abandon") {
        await tx.queueDeadLetter.update({ where: { id: entry.id }, data: { state: "abandoned", resolvedAt: new Date(), version: { increment: 1 } } });
        await tx.queueJob.update({ where: { id: job.id }, data: { status: "abandoned", version: { increment: 1 } } });
        after = { status: "abandoned", reservationsReleased: false };
      } else {
        if (!input.evidenceRef || entry.classification !== "reconciliation") conflict("QUEUE_RECONCILIATION_UNSUPPORTED");
        const busy = await tx.queueAdminAction.count({ where: { jobId: job.id, action: "reconcile", outcome: "accepted",
          createdAt: { gt: new Date(Date.now() - 120_000) } } });
        if (busy) conflict("QUEUE_RECONCILIATION_BUSY");
        after = { status: "checking", evidenceRef: input.evidenceRef };
      }
      return tx.queueAdminAction.create({ data: { requestId: input.requestId, requestFingerprint: fingerprint,
        actorDigest: queueScopeDigest(actor), action, jobId: job.id, deadLetterId: entry.id,
        expectedVersion: input.expectedVersion, safeReason: input.reason, before, after,
        outcome: action === "reconcile" ? "accepted" : "succeeded" } });
    });
  } catch (error) {
    // Rejected requests retain the same deduplication contract as successful
    // mutations. A lost commit acknowledgement is resolved by this reread.
    const rejected = await withQueueTransaction(async tx => {
      const prior = await tx.queueAdminAction.findUnique({ where: { requestId: input.requestId } });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) conflict("QUEUE_REQUEST_ID_CONFLICT");
        return prior;
      }
      return tx.queueAdminAction.create({ data: { requestId: input.requestId, requestFingerprint: fingerprint,
        actorDigest: queueScopeDigest(actor), action, expectedVersion: input.expectedVersion, safeReason: input.reason,
        outcome: "rejected", after: { targetId, code: error instanceof QueueContractError ? error.code : "QUEUE_OPERATION_REJECTED" } } });
    });
    return result(rejected);
  }
  if (action !== "reconcile" || reserved.outcome !== "accepted") return result(reserved);
  try {
    const evidence = await inspectQueueRemoteEvidence(reserved.jobId!, input.evidenceRef!);
    reserved = await withQueueTransaction(async tx => {
      const current = await tx.queueAdminAction.findUniqueOrThrow({ where: { requestId: input.requestId } });
      if (current.outcome !== "accepted") return current;
      const entry = await tx.queueDeadLetter.findUniqueOrThrow({ where: { id: targetId }, include: { job: true } });
      if (!["open", "abandoned"].includes(entry.state) || entry.version !== input.expectedVersion ||
        !["reconciliation_required", "abandoned"].includes(entry.job.status)) conflict("QUEUE_VERSION_CONFLICT");
      const detail = entry.detail && typeof entry.detail === "object" && !Array.isArray(entry.detail) ? entry.detail : {};
      await tx.queueDeadLetter.update({ where: { id: entry.id }, data: { classification: "terminal", version: { increment: 1 },
        detail: { ...detail, reconciliation: evidence } as Prisma.InputJsonValue } });
      await tx.queueJob.update({ where: { id: entry.jobId }, data: {
        status: entry.job.status === "abandoned" ? "abandoned" : "dead_letter", version: { increment: 1 },
      } });
      const attempts = await tx.queueAttempt.findMany({ where: { jobId: entry.jobId, reservations: { some: { releasedAt: null } } }, select: { id: true } });
      const releasedAt = await queueDatabaseNow(tx);
      for (const attempt of attempts) await releaseQueueReservationsTx(tx, attempt.id, releasedAt);
      return tx.queueAdminAction.update({ where: { id: current.id }, data: { outcome: "succeeded", after: evidence } });
    });
  } catch (error) {
    reserved = await withQueueTransaction(tx => tx.queueAdminAction.update({ where: { id: reserved.id },
      data: { outcome: "failed", after: { code: error instanceof QueueContractError ? error.code : "QUEUE_REMOTE_CHECK_FAILED" } } }));
  }
  return result(reserved);
}

/** Closed groups reject claims immediately; finish their remaining cancellation in bounded sweeps. */
export function cancelClosedQueueGroups() {
  return withQueueTransaction(async tx => {
    const jobs = await tx.queueJob.findMany({ where: {
      orderGroup: { closedAt: { not: null } }, status: { in: ["ready", "retry_wait", "suspended"] },
    }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
    for (const job of jobs) {
      await requestQueueCancellationTx(tx, job.id);
      await cancelSourceTx(tx, job.executionType, job.executionId, false);
    }
    return jobs.length;
  });
}
