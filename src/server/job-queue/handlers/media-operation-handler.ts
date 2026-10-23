import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import { uploadMediaOperationImages } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import { uploadMediaOperationVideo } from "@/server/video-generation/storage/adapters/leemage-storage-adapter";
import { removeImageBackground } from "@/server/media-operations/hf-background-removal-adapter";
import { processVideoOperation, VideoOperationError } from "@/server/media-operations/ffmpeg-video-processor";
import { processVideoFrameOperation } from "@/server/media-operations/ffmpeg-frame-processor";
import { videoFrameOutputPortIds } from "@/shared/generation-graph/video-frame-extraction";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { QueueContractError, type QueueFailure } from "../contracts";
import type { QueueHandler } from "../job-queue-handler";

class MediaQueueFailure extends Error {
  constructor(readonly failure: QueueFailure) { super(failure.code); }
}
export const mediaOperationQueueHandler: QueueHandler = {
  kind: "media_operation",
  async prepareTx(tx, job, lease) {
    const result = await tx.mediaOperation.updateMany({
      where: { id: job.executionId, status: "pending" },
      data: { status: "processing", progress: 10, executionLeaseToken: lease.token,
        executionLeaseVersion: lease.version, executionLeaseUntil: new Date(Date.now() + 60_000) },
    });
    if (result.count !== 1) throw new QueueContractError("QUEUE_SOURCE_NOT_PENDING");
  },
  async execute(job, context) {
    const source = await prisma.mediaOperation.findUniqueOrThrow({ where: { id: job.executionId } });
    const operation = { ...source, ...await mediaAssetRepository.getOperation(source.ownerEmail, source.id) };
    if (!operation.graphNode || operation.graphNode.kind !== operation.type ||
      operation.graphNode.configVersion !== operation.configVersion ||
      !validateNodeConfig(operation.type, operation.configVersion, { parameters: operation.parameters }).supported) {
      throw new MediaQueueFailure({ code: "MEDIA_OPERATION_TARGET_INVALID", phase: "input.validate", disposition: "terminal", executionStopped: true });
    }
    await context.assertOwned();
    let artifacts: GeneratedMediaArtifact[];
    let processorStopped = false;
    try {
      if (operation.type === "edit.image.removeBackground") {
        const input = operation.inputs[0];
        if (!input) throw new Error("NODE_INPUT_INVALID");
        const asset = await mediaAssetService.get(operation.ownerEmail, input.assetId);
        const result = await removeImageBackground(asset.url);
        processorStopped = true;
        await context.assertOwned();
        artifacts = await uploadMediaOperationImages(operation.id, [{ dataUrl: result.dataUrl, width: asset.width, height: asset.height }]);
      } else if (operation.type === "edit.video.extractFrames") {
        const frames = await processVideoFrameOperation(operation, context.signal);
        processorStopped = true;
        const ports = videoFrameOutputPortIds({ parameters: operation.parameters });
        if (frames.length !== ports.length || ports.some(port => frames.filter(f => f.outputPortId === port).length !== 1))
          throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
        await context.assertOwned();
        const uploaded = await uploadMediaOperationImages(operation.id, frames.map(frame => ({
          dataUrl: "data:image/png;base64," + frame.buffer.toString("base64"), width: frame.width, height: frame.height,
        })));
        if (uploaded.length !== frames.length) throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
        artifacts = uploaded.map((artifact, index) => ({ ...artifact, outputPortId: frames[index].outputPortId, sortOrder: 0 }));
      } else {
        const video = await processVideoOperation(operation, context.signal);
        processorStopped = true;
        await context.assertOwned();
        artifacts = await uploadMediaOperationVideo(operation.id, video);
      }
      await context.assertOwned();
      return artifacts;
    } catch (error) {
      // A returned local processor promise has completed its cleanup; an
      // interrupted remote request does not establish remote termination.
      const stopped = processorStopped || (operation.type !== "edit.image.removeBackground" && error instanceof VideoOperationError);
      throw new MediaQueueFailure({ code: error instanceof VideoOperationError ? error.code : "PROCESSOR_FAILED",
        phase: "execute", disposition: stopped ? "terminal" : "reconciliation", executionStopped: stopped });
    }
  },
  async settleTx(tx, job, lease, value) {
    const row = await tx.mediaOperation.findUniqueOrThrow({ where: { id: job.executionId } });
    await mediaAssetRepository.completeServerOperation(row.ownerEmail, row.id, value as GeneratedMediaArtifact[], new Date(), lease, tx);
    return "succeeded";
  },
  async failTx(tx, job, failure) {
    await tx.mediaOperation.updateMany({
      where: { id: job.executionId, status: { in: ["pending", "processing", "uploading"] } },
      data: { status: job.cancelRequestedAt ? "cancelled" : "failed", errorCode: failure.code,
        finishedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
    });
    await releaseStorageCleanupsForRequest(tx, job.executionId);
  },
  classifyFailure(error) {
    return error instanceof MediaQueueFailure ? error.failure :
      { code: "PROCESSOR_FAILED", phase: "execute", disposition: "reconciliation", executionStopped: false };
  },
};
