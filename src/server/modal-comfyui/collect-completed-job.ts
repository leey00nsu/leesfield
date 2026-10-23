import { modalConfigSchema, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
import { createModalClient, ModalApiError, type ModalClient } from "./client";
import { executeModalWorkflow } from "./executor";
import { modalJobRepository, type ModalJobRepository, type ModalSubmission } from "./job-repository";

/** Collect a proven completed remote job. The provider and durable ledger are
 * read-only, so this path cannot submit, upload, cancel, or resurrect its source. */
export async function collectCompletedModalJob(
  requestId: string,
  expectedJobId: string,
  dependencies: { client?: ModalClient; repository?: ModalJobRepository } = {},
) {
  const source = dependencies.repository ?? modalJobRepository;
  const initial = await source.find?.(requestId);
  const snapshot = initial?.submission as ModalSubmission | null;
  if (!initial || initial.jobId !== expectedJobId || !snapshot?.execution) {
    throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
  }
  const config = modalConfigSchema.parse(snapshot.execution.config);
  const raw = dependencies.client ?? createModalClient(config.timeout_ms, modalExecutionLimits(config));
  if (raw.origin !== snapshot.execution.origin) throw new ModalApiError("MODAL_REQUEST_ORIGIN_CHANGED");
  const client: ModalClient = {
    origin: raw.origin,
    async json(path, init) {
      if (init?.method && init.method !== "GET") throw new ModalApiError("MODAL_RECOVERY_WRITE_FORBIDDEN");
      return raw.json(path, init);
    },
    async upload() { throw new ModalApiError("MODAL_RECOVERY_WRITE_FORBIDDEN"); },
    download: (...args) => raw.download(...args),
  };
  const status = await client.json("/api/jobs/" + expectedJobId) as { id?: unknown; status?: unknown };
  if (status?.id !== expectedJobId || status.status !== "completed") {
    throw new ModalApiError("MODAL_RECOVERY_JOB_NOT_COMPLETED");
  }
  const reread = async () => {
    const current = await source.find?.(requestId);
    if (!current || current.jobId !== expectedJobId || current.fingerprint !== initial.fingerprint ||
        JSON.stringify(current.submission) !== JSON.stringify(initial.submission)) {
      throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
    }
    return current;
  };
  const readOnlyRepository: ModalJobRepository = {
    async find() { return reread(); },
    async acquire() { return { ...await reread(), lease: "read-only-collection" }; },
    async save() { throw new ModalApiError("MODAL_RECOVERY_WRITE_FORBIDDEN"); },
    async release() {},
  };
  const result = await executeModalWorkflow(config, { dynamicParams: snapshot.execution.values },
    requestId, readOnlyRepository, { client });
  return { ...result, config, values: snapshot.execution.values };
}
