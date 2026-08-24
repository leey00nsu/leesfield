import { Prisma } from "@prisma/client";

import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationStatus } from "@/features/image-generation/model/image-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import { uploadInputImages } from "@/server/shared/input-image-uploader";

export type SubmitImageGenerationInput = {
  payload: ImageGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
};

export type ImageGenerationSubmissionRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
};

export class ImageGenerationActiveNodeError extends Error {
  readonly code = "NODE_GENERATION_ACTIVE";

  constructor() {
    super("NODE_GENERATION_ACTIVE");
    this.name = "ImageGenerationActiveNodeError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function submitImageGeneration({
  payload,
  ownerEmail,
  apiKeyId = null,
  graphNodeId = null,
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
  let record;
  try {
    record = await createImageGenerationRecord(
      requestId,
      {
        ...payload,
        initImages: resolvedInitImages,
      },
      ownerEmail,
      apiKeyId,
      graphNodeId,
    );
  } catch (error) {
    if (graphNodeId && isUniqueConstraintError(error)) {
      throw new ImageGenerationActiveNodeError();
    }
    throw error;
  }

  return {
    record: {
      id: record.requestId,
      status: record.status,
      progress: record.progress,
    } satisfies ImageGenerationSubmissionRecord,
  };
}
