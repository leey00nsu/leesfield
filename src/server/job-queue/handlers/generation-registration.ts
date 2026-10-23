import type { Prisma } from "@prisma/client";
import { enqueueQueueJobTx, queueScopeDigest } from "../job-queue-registration";

export async function enqueueGenerationTx(
  tx: Prisma.TransactionClient, mediaType: "image" | "video" | "audio",
  record: { id: string; requestId: string; ownerEmail: string | null; modelKey: string | null; graphNodeId?: string | null },
) {
  if (!record.modelKey) throw new Error("QUEUE_MODEL_REQUIRED");
  return enqueueQueueJobTx(tx, {
    kind: mediaType === "image" ? "generate_image" : mediaType === "video" ? "generate_video" : "generate_audio",
    source: {
      type: mediaType === "image" ? "image_generation" : mediaType === "video" ? "video_generation" : "audio_generation",
      id: record.id,
    },
    snapshotRef: mediaType + ":" + record.id + (record.graphNodeId ? ":node:" + record.graphNodeId : ":classic"),
    ownerScopeDigest: queueScopeDigest(record.ownerEmail ?? "legacy:" + record.requestId),
    resources: [{ type: "model", key: "model:" + mediaType + ":" + record.modelKey, modelType: mediaType, modelKey: record.modelKey }],
  });
}
