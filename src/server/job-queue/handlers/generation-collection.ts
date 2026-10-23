import type { QueueJob } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { collectCompletedModalJob } from "@/server/modal-comfyui/collect-completed-job";
import { modalOutputMetadata } from "@/server/modal-comfyui/output-metadata";
import { mediaOutputDataUrl } from "@/server/media-assets/binary-media-output";
import { leemageStorageAdapter } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import { leemageVideoStorageAdapter } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import { QueueContractError } from "../contracts";
import type { QueueExecutionContext } from "../job-queue-handler";

export async function collectionDirective(job: QueueJob) {
  if (job.executionId === job.sourceId) return null;
  const action = await prisma.queueAdminAction.findFirst({ where: { jobId: job.id, action: "redrive", outcome: "succeeded",
    after: { path: ["cycle"], equals: job.cycle } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const directive = action?.after as { mode?: string; executionId?: string; collectionRequestId?: string; collectionJobId?: string } | null;
  if (!directive || directive.executionId !== job.executionId) throw new QueueContractError("QUEUE_REDRIVE_DIRECTIVE_MISSING");
  if (directive.mode === "execute") return null;
  if (directive.mode !== "collect" || !directive.collectionRequestId || !directive.collectionJobId)
    throw new QueueContractError("QUEUE_COLLECTION_REFERENCE_MISSING");
  return { requestId: directive.collectionRequestId, jobId: directive.collectionJobId };
}
export async function collectGeneration(
  media: "image" | "video", requestId: string, directive: { requestId: string; jobId: string },
  payload: ImageGenerationFormValues | VideoGenerationFormValues, context: QueueExecutionContext, onUploading: () => Promise<void>,
) {
  try {
  await context.assertOwned();
  await context.recordRemoteEvidence("modal:" + directive.requestId);
  const collected = await collectCompletedModalJob(directive.requestId, directive.jobId);
  if (collected.config.workflow.category !== media) throw new QueueContractError("QUEUE_COLLECTION_MEDIA_MISMATCH");
  await context.assertOwned();
  if (context.signal.aborted) throw context.signal.reason;
  await onUploading();
  const metadata = await modalOutputMetadata(collected.outputs, media);
  const stored = media === "image"
    ? await leemageStorageAdapter.uploadImages({ ...payload as ImageGenerationFormValues, width: metadata.width, height: metadata.height }, requestId, collected.outputs.map(mediaOutputDataUrl))
    : await leemageVideoStorageAdapter.uploadVideos(payload as VideoGenerationFormValues, requestId, collected.outputs, metadata);
  if (stored.status !== "completed" || stored.errorMessage || !stored.artifacts?.length)
    throw new QueueContractError("QUEUE_COLLECTION_STORAGE_FAILED");
  return stored;
  } catch {
    // No new compute request was made; preserve collect-only on later redrive.
    throw new QueueContractError("QUEUE_COLLECTION_FAILED");
  }
}
