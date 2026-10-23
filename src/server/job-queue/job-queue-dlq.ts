import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { queueJobKinds } from "./contracts";
import { queueScopeDigest } from "./job-queue-registration";

const listSchema = z.object({
  kind: z.enum(queueJobKinds).optional(), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,119}$/).optional(),
  classification: z.enum(["terminal", "reconciliation"]).optional(),
  state: z.enum(["open", "redriven", "resolved", "abandoned"]).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  cursor: z.string().max(400).optional(), limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const cursorSchema = z.object({ at: z.string().datetime(), id: z.string().uuid() });
const summarySelect = {
  id: true, jobId: true, failedAttemptId: true, classification: true, state: true,
  safeErrorCode: true, phase: true, createdAt: true, resolvedAt: true, detailPurgedAt: true, version: true,
  job: { select: { kind: true, sourceType: true, sourceId: true, executionId: true, status: true,
    orderGroupId: true, sequence: true, cycle: true, snapshotRef: true } },
} as const;

export async function listQueueDeadLetters(raw: unknown) {
  const input = listSchema.parse(raw);
  const cursor = input.cursor ? cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString())) : null;
  const rows = await prisma.queueDeadLetter.findMany({
    where: { ...(input.kind ? { job: { kind: input.kind } } : {}),
      safeErrorCode: input.code, classification: input.classification, state: input.state,
      createdAt: { gte: input.from, lte: input.to },
      ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { lt: cursor.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1, select: summarySelect,
  });
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > input.limit && last
    ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
}
export async function getQueueDeadLetter(id: string) {
  z.string().uuid().parse(id);
  const entry = await prisma.queueDeadLetter.findUniqueOrThrow({ where: { id }, select: {
    ...summarySelect,
    job: { select: { ...summarySelect.job.select, maxAttempts: true, retryDelayMs: true, policyVersion: true,
      ownerScopeDigest: true, _count: { select: { attempts: true, adminActions: true } },
      cancelRequestedAt: true, orderGroup: { select: { id: true, headSequence: true, blockedByJobId: true, closedAt: true, version: true } },
      attempts: { orderBy: { lifetimeOrdinal: "asc" }, take: 100, select: {
        id: true, lifetimeOrdinal: true, cycle: true, cycleOrdinal: true, executionType: true, executionId: true,
        phase: true, outcome: true, startedAt: true, finishedAt: true, heartbeatAt: true, leaseUntil: true, remoteEvidenceRef: true,
        reservations: { select: { resourceKey: true, disposition: true, releasedAt: true } },
      } },
      adminActions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
        select: { requestId: true, action: true, safeReason: true, outcome: true, createdAt: true } },
    } },
  } });
  const job = entry.job;
  let ownerScope: string | null = null;
  if (job.kind === "storage_cleanup") {
    const source = await prisma.mediaCleanupTask.findUnique({ where: { id: job.sourceId }, select: { ownerEmail: true, storageProvider: true } });
    if (source) ownerScope = source.ownerEmail ?? "storage:" + source.storageProvider;
  } else if (job.kind === "assistant" || job.kind === "media_operation") {
    const model = job.kind === "assistant" ? prisma.assistantExecution : prisma.mediaOperation;
    const source = await (model as typeof prisma.assistantExecution).findUnique({ where: { id: job.sourceId }, select: { ownerEmail: true } });
    if (source) ownerScope = source.ownerEmail;
  } else {
    const model = job.kind === "generate_image" ? prisma.imageGeneration : job.kind === "generate_video" ? prisma.videoGeneration : prisma.audioGeneration;
    const source = await (model as typeof prisma.imageGeneration).findUnique({ where: { id: job.sourceId }, select: { ownerEmail: true, requestId: true } });
    if (source) ownerScope = source.ownerEmail ?? "legacy:" + source.requestId;
  }
  const sourceAvailable = ownerScope !== null && queueScopeDigest(ownerScope) === job.ownerScopeDigest;
  const { ownerScopeDigest: _scope, ...safeJob } = job;
  void _scope;
  return { ...entry, job: safeJob, sourceAvailable, redriveBlockedReason:
    !sourceAvailable ? "QUEUE_REDRIVE_SOURCE_MISSING" : entry.classification === "reconciliation" ? "QUEUE_REMOTE_STOP_NOT_CONFIRMED"
      : entry.state !== "open" ? "QUEUE_DLQ_NOT_OPEN" : null };
}
