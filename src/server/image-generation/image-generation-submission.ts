import { Prisma } from "@prisma/client";

import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationStatus } from "@/features/image-generation/model/image-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import {
  applyUploadedGenerationInputAssets,
  generationInputMediaForPayload,
  uploadGenerationInputAssets,
} from "@/server/shared/input-media-uploader";
import { NodeExecutionActiveError } from "@/server/node-executions/node-execution-errors";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";

export type SubmitImageGenerationInput = {
  payload: ImageGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
  /** Reserved by the admission ledger so a retry reuses one request. */
  requestId?: string;
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>;
  inputAssetRefs?: import("@/server/generation-request/generation-input-assets").GenerationInputAssetRef[];
};

export type ImageGenerationSubmissionRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
};

export class ImageGenerationActiveNodeError extends NodeExecutionActiveError {
  readonly code = "NODE_GENERATION_ACTIVE";

  constructor() {
    super();
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
  requestId: reservedRequestId,
  requestSnapshot,
  inputAssetRefs,
}: SubmitImageGenerationInput) {
  startGenerationWorker();

  const requestId = reservedRequestId ?? crypto.randomUUID();
  const initImages = (payload.initImages ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  let uploaded = [] as Awaited<ReturnType<typeof uploadGenerationInputAssets>>;
  if (!requestSnapshot) {
    const dynamicParams = payload.dynamicParams && typeof payload.dynamicParams === "object"
      ? payload.dynamicParams
      : undefined;
    const hasPotentialDynamicFile = dynamicParams && Object.values(dynamicParams).some((value) =>
      typeof value === "string"
        ? /^(data:|blob:|https?:\/\/)/i.test(value)
        : Array.isArray(value) && value.some((item) => typeof item === "string" && /^(data:|blob:|https?:\/\/)/i.test(item)),
    );
    if (initImages.length > 0 || hasPotentialDynamicFile) {
      const model = hasPotentialDynamicFile
        ? (await getModelCatalog()).find((candidate) => candidate.type === "image" && candidate.key === payload.model)
        : undefined;
      uploaded = await uploadGenerationInputAssets(
        requestId,
        ownerEmail,
        generationInputMediaForPayload(
          "image",
          { ...payload, initImages },
          model ?? { type: "image" },
        ),
      );
    }
  }
  let record;
  try {
    const recordPayload = requestSnapshot
      ? { ...payload, initImages: [] }
      : applyUploadedGenerationInputAssets({ ...payload, initImages }, uploaded);
    record = requestSnapshot && inputAssetRefs?.length
      ? await createImageGenerationRecord(
          requestId,
          recordPayload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
          inputAssetRefs,
        )
      : requestSnapshot
      ? await createImageGenerationRecord(
          requestId,
          recordPayload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
        )
      : uploaded.length > 0
        ? await createImageGenerationRecord(
            requestId,
            recordPayload,
            ownerEmail,
            apiKeyId,
            graphNodeId,
            undefined,
            uploaded.map(({ ref }) => ref),
          )
        : await createImageGenerationRecord(requestId, recordPayload, ownerEmail, apiKeyId, graphNodeId);
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
