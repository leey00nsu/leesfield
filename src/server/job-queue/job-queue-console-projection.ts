import { Prisma } from "@prisma/client";
import type { ConsoleJob, ConsoleReason } from "@/shared/api/job-queue-console-contract";

/** Explicit projection: queue leases, prompts, snapshots, URLs and credentials never enter the DTO. */
export const consoleJobSelect = {
  id: true, kind: true, status: true, version: true, cycle: true, sourceType: true, sourceId: true, sourceRevision: true,
  executionType: true, executionId: true, createdAt: true, updatedAt: true, availableAt: true, cancelRequestedAt: true,
  sequence: true, resources: { select: { resourceKey: true } },
  orderGroup: { select: { id: true, headSequence: true, closedAt: true, blockedByJobId: true } },
  currentAttempt: { select: { id: true, lifetimeOrdinal: true, cycle: true, phase: true, workerInstanceId: true,
    startedAt: true, finishedAt: true, heartbeatAt: true, leaseUntil: true } },
} satisfies Prisma.QueueJobSelect;
type JobRow = Prisma.QueueJobGetPayload<{ select: typeof consoleJobSelect }>;
export type ConsoleSource = {
  id: string | null; status: string; model: string | null; graphId: string | null; nodeId: string | null;
  origin: ConsoleJob["origin"]; title: string | null;
  sourceRequestId: string | null; requestId: string | null;
};
const iso = (value: Date | null) => value?.toISOString() ?? null;
export function projectConsoleJob(job: JobRow, source: ConsoleSource | undefined, reasons: ConsoleReason[]): ConsoleJob {
  const group = job.orderGroup;
  const attempt = job.currentAttempt;
  return {
    id: job.id, kind: job.kind, status: job.status, version: job.version, cycle: job.cycle,
    sourceType: job.sourceType, sourceId: job.sourceId, sourceRevision: job.sourceRevision,
    executionType: job.executionType, executionId: job.executionId,
    createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), availableAt: job.availableAt.toISOString(),
    cancelRequestedAt: iso(job.cancelRequestedAt), title: source?.title?.slice(0, 200) || `${job.kind} · ${job.sourceId.slice(0, 8)}`,
    origin: source?.origin ?? "unknown", sourceAvailable: Boolean(source?.id), sourceStatus: source?.status ?? null,
    model: source?.model ?? null, graphId: source?.graphId ?? null, nodeId: source?.nodeId ?? null,
    sourceRequestId: source?.sourceRequestId ?? null, requestId: source?.requestId ?? null,
    resources: job.resources.map(r => r.resourceKey),
    group: group ? { id: group.id, sequence: job.sequence?.toString() ?? null, head: group.headSequence.toString(),
      closedAt: iso(group.closedAt), blockedByJobId: group.blockedByJobId } : null,
    primaryReason: reasons[0] ?? null, reasons,
    attempt: attempt ? { id: attempt.id, ordinal: attempt.lifetimeOrdinal, cycle: attempt.cycle, phase: attempt.phase,
      workerInstanceId: attempt.workerInstanceId, startedAt: attempt.startedAt.toISOString(), finishedAt: iso(attempt.finishedAt),
      heartbeatAt: attempt.heartbeatAt.toISOString(), leaseUntil: attempt.leaseUntil.toISOString() } : null,
  };
}
