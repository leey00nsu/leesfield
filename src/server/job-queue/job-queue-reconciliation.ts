import { modalConfigSchema, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
import { prisma } from "@/server/db/prisma";
import { createModalClient } from "@/server/modal-comfyui/client";
import type { ModalSubmission } from "@/server/modal-comfyui/job-repository";
import { QueueContractError } from "./contracts";
import { queueGenerationModel } from "./job-queue-redrive-source";

/** Evidence is a durable provider-ledger reference, never an operator URL or boolean. */
export async function inspectQueueRemoteEvidence(jobId: string, evidenceRef: string) {
  const job = await prisma.queueJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!["generate_image", "generate_video"].includes(job.kind)) throw new QueueContractError("QUEUE_RECONCILIATION_UNSUPPORTED");
  const source = await queueGenerationModel(prisma, job.kind).findUnique({ where: { id: job.executionId } });
  if (!source || evidenceRef !== "modal:" + source.requestId) throw new QueueContractError("QUEUE_REMOTE_REFERENCE_MISMATCH");
  const ledger = await prisma.modalComfyJob.findUnique({ where: { requestId: source.requestId } });
  const submission = ledger?.submission as ModalSubmission | null;
  if (!ledger?.jobId || !submission?.execution) throw new QueueContractError("QUEUE_REMOTE_REFERENCE_MISSING");
  const config = modalConfigSchema.parse(submission.execution.config);
  const client = createModalClient(Math.min(config.timeout_ms, 60_000), modalExecutionLimits(config));
  if (client.origin !== submission.execution.origin) throw new QueueContractError("QUEUE_REMOTE_ORIGIN_CHANGED");
  const response = await client.json("/api/jobs/" + ledger.jobId) as { id?: unknown; status?: unknown };
  if (response.id !== ledger.jobId || !["completed", "failed", "cancelled"].includes(String(response.status)))
    throw new QueueContractError("QUEUE_REMOTE_STILL_UNCONFIRMED");
  const current = await prisma.modalComfyJob.findUniqueOrThrow({ where: { requestId: source.requestId } });
  if (current.jobId !== ledger.jobId || current.fingerprint !== ledger.fingerprint ||
    JSON.stringify(current.submission) !== JSON.stringify(ledger.submission)) throw new QueueContractError("QUEUE_REMOTE_REFERENCE_CHANGED");
  return { status: String(response.status), requestId: source.requestId, jobId: ledger.jobId, fingerprint: ledger.fingerprint };
}
