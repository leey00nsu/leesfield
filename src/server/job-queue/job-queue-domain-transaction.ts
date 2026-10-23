import type { Prisma } from "@prisma/client";
import { withQueueTransaction } from "./job-queue-transaction";

/** Reuse the caller's short transaction instead of nesting a second commit. */
export function inQueueDomainTransaction<T>(
  transaction: Prisma.TransactionClient | undefined,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return transaction ? run(transaction) : withQueueTransaction(run);
}
