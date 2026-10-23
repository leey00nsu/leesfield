import type { QueueJob } from "@prisma/client";
import type { QueueFailure, QueueJobKind, QueueLease } from "./contracts";
import type { QueueTransaction } from "./job-queue-transaction";

export type QueueExecutionContext = {
  lease: QueueLease;
  signal: AbortSignal;
  assertOwned(): Promise<void>;
  /** Persist an existing provider ledger reference, never credentials/payload. */
  recordRemoteEvidence(reference: string): Promise<void>;
};

export type QueueHandler = {
  kind: QueueJobKind;
  prepareTx(tx: QueueTransaction, job: QueueJob, lease: QueueLease): Promise<void>;
  execute(job: QueueJob, context: QueueExecutionContext): Promise<unknown>;
  settleTx(tx: QueueTransaction, job: QueueJob, lease: QueueLease, result: unknown): Promise<"succeeded" | "protected">;
  failTx(tx: QueueTransaction, job: QueueJob, failure: QueueFailure, retrying: boolean): Promise<void>;
  classifyFailure(error: unknown, job: QueueJob): QueueFailure;
};
