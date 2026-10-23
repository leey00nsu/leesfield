import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { QUEUE_TRANSACTION_LOCK, QueueContractError } from "./contracts";
import { notifyQueueCommit } from "./job-queue-wakeup";

export type QueueTransaction = Prisma.TransactionClient;

/** Acquire before admission/node/domain locks, including inherited transactions. */
export async function lockQueueTransaction(tx: QueueTransaction) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${QUEUE_TRANSACTION_LOCK}))`);
}

export async function withQueueTransaction<T>(operation: (tx: QueueTransaction) => Promise<T>) {
  let committedTx: QueueTransaction | undefined;
  const result = await prisma.$transaction(async tx => {
    committedTx = tx;
    await lockQueueTransaction(tx);
    return operation(tx);
  });
  if (committedTx) notifyQueueCommit(committedTx);
  return result;
}

export async function queueDatabaseNow(tx: QueueTransaction) {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
  if (!row) throw new QueueContractError("QUEUE_CLOCK_UNAVAILABLE");
  return row.now;
}
