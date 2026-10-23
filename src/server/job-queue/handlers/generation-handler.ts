import type { Prisma, QueueJob } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import { resolveAudioGenerationResult } from "@/server/audio-generation/audio-generation";
import { saveImageGenerationResult } from "@/server/image-generation/image-generation-repository";
import { saveVideoGenerationResult } from "@/server/video-generation/video-generation-repository";
import { saveAudioGenerationResult } from "@/server/audio-generation/audio-generation-repository";
import { buildImagePayload, buildVideoPayload, buildAudioPayload, getImageRuntimeState, getVideoRuntimeState, getAudioRuntimeState } from "@/server/generation-worker/generation-payload";
import { frozenExecutionModel } from "@/server/generation-request/request-snapshot";
import { validateImageGenerationPayload, validateVideoGenerationPayload, validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";
import type { QueueExecutionContext, QueueHandler } from "../job-queue-handler";
import { QueueContractError, type QueueFailure } from "../contracts";
import { requireQueueLeaseTx } from "../job-queue-lease";
import { withQueueTransaction } from "../job-queue-transaction";
import { collectionDirective, collectGeneration } from "./generation-collection";

type Media = "image" | "video" | "audio";
type Result = Awaited<ReturnType<typeof resolveImageGenerationResult>> |
  Awaited<ReturnType<typeof resolveVideoGenerationResult>> |
  Awaited<ReturnType<typeof resolveAudioGenerationResult>>;
type ExecutionResult = { media: Media; result: Result };

/** All model unions share these status/snapshot fields. */
function generationModel(tx: Prisma.TransactionClient | typeof prisma, media: Media) {
  return (media === "image" ? tx.imageGeneration : media === "video" ? tx.videoGeneration : tx.audioGeneration) as Prisma.TransactionClient["imageGeneration"];
}

export class QueueGenerationFailure extends Error {
  constructor(readonly failure: QueueFailure) { super(failure.code); }
}
function inputError(code: string): never {
  throw new QueueGenerationFailure({ code, phase: "input.validate", disposition: "terminal", executionStopped: true });
}
async function prepareInput<T>(prepare: () => Promise<T>): Promise<T> {
  try { return await prepare(); }
  catch (error) {
    if (error instanceof QueueGenerationFailure) throw error;
    // Hydration/validation has not called a provider, so there is no unknown
    // remote execution to reserve capacity for.
    inputError("QUEUE_INPUT_UNAVAILABLE");
  }
}

async function executeGeneration(media: Media, job: QueueJob, context: QueueExecutionContext): Promise<ExecutionResult> {
  const model = generationModel(prisma, media);
  const record = await model.findUniqueOrThrow({ where: { id: job.executionId } });
  await context.assertOwned();
  const lifecycle = {
    onUploading: async () => {
      await context.assertOwned();
      if (context.signal.aborted) throw context.signal.reason;
      await withQueueTransaction(async tx => {
        await requireQueueLeaseTx(tx, context.lease);
        const updated = await generationModel(tx, media).updateMany({
          where: { id: record.id, status: "processing", cancelRequestedAt: null },
          data: { status: "uploading", progress: 0 },
        });
        if (updated.count !== 1) throw new QueueContractError("QUEUE_CANCEL_REQUESTED");
      });
    },
  };
  let result: Result;
  const collect = await collectionDirective(job);
  if (media === "image") {
    const { data, executionModel } = await prepareInput(async () => {
      const runtime = await getImageRuntimeState();
      if (!runtime) inputError("MODEL_NOT_FOUND");
      const payload = await buildImagePayload(record, runtime);
      const executionModel = frozenExecutionModel(record.requestParams, media, payload.model);
      const parsed = await validateImageGenerationPayload(payload, undefined, executionModel);
      if (!parsed.success) inputError("INVALID_JOB_PAYLOAD");
      return { data: parsed.data, executionModel };
    });
    await context.assertOwned();
    result = collect ? await collectGeneration("image", record.requestId, collect, data, context, lifecycle.onUploading)
      : await resolveImageGenerationResult(data, record.requestId, { ...lifecycle, executionModel });
  } else if (media === "video") {
    const { data, executionModel } = await prepareInput(async () => {
      const runtime = await getVideoRuntimeState();
      if (!runtime) inputError("MODEL_NOT_FOUND");
      const payload = await buildVideoPayload(record, runtime);
      const executionModel = frozenExecutionModel(record.requestParams, media, payload.model);
      const parsed = await validateVideoGenerationPayload(payload, undefined, executionModel);
      if (!parsed.success) inputError("INVALID_JOB_PAYLOAD");
      return { data: parsed.data, executionModel };
    });
    await context.assertOwned();
    result = collect ? await collectGeneration("video", record.requestId, collect, data, context, lifecycle.onUploading)
      : await resolveVideoGenerationResult(data, record.requestId, { ...lifecycle, executionModel });
  } else {
    const data = await prepareInput(async () => {
      const runtime = await getAudioRuntimeState();
      if (!runtime) inputError("MODEL_NOT_FOUND");
      const parsed = await validateAudioGenerationPayload(await buildAudioPayload(record, runtime));
      if (!parsed.success) inputError("INVALID_JOB_PAYLOAD");
      return parsed.data;
    });
    await context.assertOwned();
    result = await resolveAudioGenerationResult(data, record.requestId, lifecycle);
  }
  const remote = await prisma.modalComfyJob.findUnique({ where: { requestId: record.requestId }, select: { jobId: true } });
  if (remote?.jobId) await context.recordRemoteEvidence("modal:" + record.requestId);
  await context.assertOwned();
  if (result.status !== "completed") {
    // Resolvers intentionally return a safe user error after catching provider
    // failures. That does not prove the remote computation stopped.
    throw new QueueGenerationFailure({
      code: "GENERATION_FAILED", phase: "provider_or_storage",
      disposition: "reconciliation", executionStopped: false,
      ...(remote?.jobId ? { remoteEvidenceRef: "modal:" + record.requestId } : {}),
    });
  }
  if (record.graphNodeId && (result.skipDbSave || !result.artifacts?.length)) {
    throw new QueueGenerationFailure({ code: "GENERATION_DURABLE_OUTPUT_REQUIRED", phase: "storage", disposition: "terminal", executionStopped: true });
  }
  return { media, result };
}

function generationHandler(media: Media): QueueHandler {
  return {
    kind: media === "image" ? "generate_image" : media === "video" ? "generate_video" : "generate_audio",
    async prepareTx(tx, job, lease) {
      const updated = await generationModel(tx, media).updateMany({
        where: { id: job.executionId, status: "pending", cancelRequestedAt: null },
        data: {
          status: "processing", executionLeaseToken: lease.token,
          executionLeaseVersion: lease.version, executionLeaseUntil: new Date(Date.now() + 60_000),
        },
      });
      if (updated.count !== 1) throw new QueueContractError("QUEUE_SOURCE_NOT_PENDING");
    },
    execute(job, context) { return executeGeneration(media, job, context); },
    async settleTx(tx, job, lease, value) {
      const { result } = value as ExecutionResult;
      const record = await generationModel(tx, media).findUniqueOrThrow({ where: { id: job.executionId } });
      if (record.cancelRequestedAt) throw new QueueContractError("QUEUE_CANCEL_REQUESTED");
      const sourceLease = { token: lease.token, version: lease.version };
      if (record.graphNodeId) {
        const completed = await nodeExecutionRepository.completeGeneration(media, record.id, result.artifacts ?? [], sourceLease, tx);
        if (completed.status !== "completed") throw new QueueContractError("QUEUE_CANCEL_REQUESTED");
      } else if (media === "image") {
        const r = result as Awaited<ReturnType<typeof resolveImageGenerationResult>>;
        await saveImageGenerationResult(record.id, "completed", 100, r.skipDbSave ? undefined : r.result, r.errorMessage, r.artifacts, sourceLease, tx);
      } else if (media === "video") {
        const r = result as Awaited<ReturnType<typeof resolveVideoGenerationResult>>;
        await saveVideoGenerationResult(record.id, "completed", 100, r.skipDbSave ? undefined : r.result, r.errorMessage, sourceLease, r.artifacts, tx);
      } else {
        const r = result as Awaited<ReturnType<typeof resolveAudioGenerationResult>>;
        await saveAudioGenerationResult(record.id, "completed", 100, r.result, r.errorMessage, sourceLease, r.artifacts, tx);
      }
      return "succeeded";
    },
    async failTx(tx, job, failure) {
      const record = await generationModel(tx, media).findUnique({ where: { id: job.executionId } });
      if (!record) return;
      await generationModel(tx, media).updateMany({
        where: { id: record.id, status: { in: ["pending", "processing", "uploading"] } },
        data: { status: job.cancelRequestedAt ? "cancelled" : "failed", progress: 0,
          errorMessage: failure.code, executionLeaseToken: null, executionLeaseUntil: null },
      });
      await releaseStorageCleanupsForRequest(tx, record.requestId);
    },
    classifyFailure(error) {
      if (error instanceof QueueGenerationFailure) return error.failure;
      // Collection never starts paid work. Its durable directive continues to
      // require GET-only collection on any later operator redrive.
      if (error instanceof QueueContractError && error.code.startsWith("QUEUE_COLLECTION_"))
        return { code: error.code, phase: "result.collect", disposition: "terminal", executionStopped: true };
      return { code: error instanceof QueueContractError ? error.code : "GENERATION_FAILED",
        phase: "execute", disposition: "reconciliation", executionStopped: false };
    },
  };
}

export const generationQueueHandlers = (["image", "video", "audio"] as const).map(generationHandler);
export type QueueGenerationArtifacts = GeneratedMediaArtifact[];
