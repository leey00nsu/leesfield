import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationStatus } from "@/features/image-generation/model/image-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import { uploadInputImages } from "@/server/shared/input-image-uploader";

export type SubmitImageGenerationInput = {
  payload: ImageGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
};

export type ImageGenerationSubmissionRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
};

export async function submitImageGeneration({
  payload,
  ownerEmail,
  apiKeyId = null,
}: SubmitImageGenerationInput) {
  startGenerationWorker();

  const requestId = crypto.randomUUID();
  const initImages = (payload.initImages ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const resolvedInitImages =
    initImages.length > 0
      ? await uploadInputImages(requestId, initImages)
      : [];
  const record = await createImageGenerationRecord(
    requestId,
    {
      ...payload,
      initImages: resolvedInitImages,
    },
    ownerEmail,
    apiKeyId,
  );

  return {
    record: {
      id: record.requestId,
      status: record.status,
      progress: record.progress,
    } satisfies ImageGenerationSubmissionRecord,
  };
}
