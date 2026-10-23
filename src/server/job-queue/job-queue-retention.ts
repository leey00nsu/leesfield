import { Prisma } from "@prisma/client";
import { withQueueTransaction } from "./job-queue-transaction";

export function queueDetailRetentionDays() {
  const raw = process.env.JOB_QUEUE_DETAIL_RETENTION_DAYS ?? "30";
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 365) throw new Error("QUEUE_RETENTION_CONFIG_INVALID");
  return value;
}
export function purgeResolvedQueueDetails(now = new Date()) {
  const cutoff = new Date(now.getTime() - queueDetailRetentionDays() * 86_400_000);
  return withQueueTransaction(async tx => {
    const entries = await tx.queueDeadLetter.findMany({
      where: { state: { in: ["resolved", "abandoned"] }, resolvedAt: { lt: cutoff }, detailPurgedAt: null,
        job: { status: { in: ["succeeded", "abandoned", "cancelled"] }, blockingGroup: { is: null },
          attempts: { none: { reservations: { some: { releasedAt: null } } } } } },
      orderBy: [{ resolvedAt: "asc" }, { id: "asc" }], take: 100, select: { id: true },
    });
    // Identity, attempts, blockers and request/actor/action audit tombstones remain.
    return tx.queueDeadLetter.updateMany({ where: { id: { in: entries.map(e => e.id) } },
      data: { detail: Prisma.DbNull, detailPurgedAt: now } });
  });
}
