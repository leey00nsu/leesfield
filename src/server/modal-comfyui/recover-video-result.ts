import { logSafeError } from "@/server/observability/request-observability";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { frozenExecutionModel, restoreRequest } from "@/server/generation-request/request-snapshot";
import { startGenerationLeaseMonitor, type GenerationLease } from "@/server/generation-worker/execution-lease";
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import { saveVideoGenerationResult } from "@/server/video-generation/video-generation-repository";
import { leemageVideoStorageAdapter } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";
import { validateVideoGenerationPayload } from "@/server/model-catalog/generation-validation";
import { modalConfigSchema, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
import { createModalClient, ModalApiError, type ModalClient } from "./client";
import { executeModalWorkflow } from "./executor";
import { modalJobRepository } from "./job-repository";
import { modalOutputMetadata } from "./output-metadata";

const collectionError = "Modal 생성 실패: MODAL_ASSETS_RESPONSE_INVALID";

/** Operator-only collection of one already completed job. Never enqueue generation. */
export async function recoverModalVideoResult(
  expected: { requestId: string; jobId: string; ownerEmail: string },
  dependencies: { client?: ModalClient } = {},
) {
  if (!expected.ownerEmail) throw new ModalApiError("MODAL_RECOVERY_OWNER_REQUIRED");
  const row = await prisma.videoGeneration.findUnique({
    where: { requestId: expected.requestId }, include: { videos: true },
  });
  if (!row || row.ownerEmail !== expected.ownerEmail || row.graphNodeId ||
      row.status !== "failed" || row.errorMessage !== collectionError ||
      row.cancelRequestedAt || row.videos.length ||
      row.executionLeaseToken || row.executionLeaseUntil) {
    throw new ModalApiError("MODAL_RECOVERY_NOT_ELIGIBLE");
  }
  const model = frozenExecutionModel(row.requestParams, "video", row.modelKey);
  if (!model) throw new ModalApiError("MODAL_RECOVERY_SNAPSHOT_REQUIRED");
  const config = modalConfigSchema.parse(model.providerConfig);
  if (config.workflow.category !== "video") throw new ModalApiError("MODAL_OUTPUT_MEDIA");
  const job = await modalJobRepository.find!(expected.requestId);
  const submission = job?.submission as { execution?: { origin?: string; values?: Record<string, unknown> } } | null;
  if (!job || job.jobId !== expected.jobId || !submission?.execution) {
    throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
  }
  const base = dependencies.client ?? createModalClient(config.timeout_ms, modalExecutionLimits(config));
  if (base.origin !== submission.execution.origin) throw new ModalApiError("MODAL_REQUEST_ORIGIN_CHANGED");
  const client: ModalClient = {
    origin: base.origin,
    async json(path, init) {
      if (init?.method && init.method !== "GET") throw new ModalApiError("MODAL_RECOVERY_WRITE_FORBIDDEN");
      return base.json(path, init);
    },
    async upload() { throw new ModalApiError("MODAL_RECOVERY_WRITE_FORBIDDEN"); },
    download: base.download,
  };
  const remote = await client.json("/api/jobs/" + expected.jobId) as { id?: unknown; status?: unknown };
  if (remote?.id !== expected.jobId || remote.status !== "completed") {
    throw new ModalApiError("MODAL_RECOVERY_JOB_NOT_COMPLETED");
  }
  // Only storage uses this payload. Executor reads its persisted input contract.
  const parsed = await validateVideoGenerationPayload({
    ...restoreRequest(row.requestParams), initImage: "", dynamicParams: submission.execution.values,
  }, undefined, model);
  if (!parsed.success) {
    logSafeError("modal.recovery.validation_failed", parsed.error, {requestId: row.requestId, provider: "modal_comfyui", phase: "recovery.validate"});
    throw new ModalApiError("MODAL_RECOVERY_SNAPSHOT_INVALID");
  }
  const payload = parsed.data;
  if (payload.model !== row.modelKey) throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
  const lease: GenerationLease = { token: randomUUID(), version: row.executionLeaseVersion + 1 };
  const claimed = await prisma.videoGeneration.updateMany({
    where: {
      id: row.id, requestId: expected.requestId, ownerEmail: expected.ownerEmail,
      updatedAt: row.updatedAt, status: "failed", errorMessage: collectionError,
      graphNodeId: null, cancelRequestedAt: null, videos: { none: {} },
      executionLeaseToken: null, executionLeaseUntil: null,
      executionLeaseVersion: row.executionLeaseVersion,
    },
    data: {
      status: "processing", executionLeaseToken: lease.token,
      executionLeaseVersion: { increment: 1 },
      executionLeaseUntil: new Date(Date.now() + config.timeout_ms + 120_000),
    },
  });
  if (claimed.count !== 1) throw new ModalApiError("MODAL_RECOVERY_STATE_CONFLICT");
  const monitor = startGenerationLeaseMonitor("video", row.id, lease);
  try {
    // Detect a replaced/deleted durable job even after the recovery claim.
    const repository = {
      ...modalJobRepository,
      async acquire(requestId: string, fingerprint: string, leaseMs: number) {
        const current = await modalJobRepository.acquire(requestId, fingerprint, leaseMs);
        if (current.jobId !== expected.jobId || JSON.stringify(current.submission) !== JSON.stringify(job.submission)) {
          await modalJobRepository.release(requestId, current.lease);
          throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
        }
        return current;
      },
      async find(requestId: string) {
        const current = await modalJobRepository.find!(requestId);
        if (!current || current.jobId !== expected.jobId || current.fingerprint !== job.fingerprint ||
            JSON.stringify(current.submission) !== JSON.stringify(job.submission)) {
          throw new ModalApiError("MODAL_RECOVERY_JOB_MISMATCH");
        }
        return current;
      },
    };
    const result = await executeModalWorkflow(config, payload, expected.requestId, repository, { client });
    monitor.assertOwned();
    const meta = await modalOutputMetadata(result.outputs, "video");
    const stored = await leemageVideoStorageAdapter.uploadVideos(payload, expected.requestId, result.outputs, meta);
    if (stored.status !== "completed" || stored.errorMessage || !stored.artifacts?.length) {
      throw new ModalApiError("MODAL_STORAGE_FAILED");
    }
    monitor.assertOwned();
    await saveVideoGenerationResult(row.id, "completed", 100, stored.result, undefined, lease, stored.artifacts);
    return { requestId: expected.requestId, jobId: result.jobId, status: "completed" as const,
      outputs: stored.artifacts.map(({ mimeType, bytes, width, height, durationMs }) =>
        ({ mimeType, bytes, width, height, durationMs })) };
  } catch (error) {
    await releaseStorageCleanupsForRequest(undefined, expected.requestId).catch(() => undefined);
    // Restore the original failure only while still owning the uncancelled row.
    await prisma.videoGeneration.updateMany({
      where: { id: row.id, ownerEmail: expected.ownerEmail, status: { in: ["processing", "uploading"] },
        cancelRequestedAt: null, executionLeaseToken: lease.token, executionLeaseVersion: lease.version,
        executionLeaseUntil: { gt: new Date() }, videos: { none: {} } },
      data: { status: "failed", progress: row.progress, errorMessage: row.errorMessage,
        executionLeaseToken: null, executionLeaseUntil: null },
    });
    throw error;
  } finally { monitor.stop(); }
}
