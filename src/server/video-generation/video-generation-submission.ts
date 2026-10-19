import { Prisma } from "@prisma/client";
import type { CinemaSnapshot } from "@/shared/cinema/cinema-contract";

import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationStatus } from "@/features/video-generation/model/video-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { NodeExecutionActiveError } from "@/server/node-executions/node-execution-errors";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import {
  applyUploadedGenerationInputAssets,
  generationInputMediaForPayload,
  uploadGenerationInputAssets,
} from "@/server/shared/input-media-uploader";

import { createVideoGenerationRecord } from "./video-generation-repository";

export type SubmitVideoGenerationInput = {
  transaction?: Prisma.TransactionClient;
  payload: VideoGenerationFormValues;
  cinema?: CinemaSnapshot;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>;
  requestId?: string;
  inputAssetRefs?: import("@/server/generation-request/generation-input-assets").GenerationInputAssetRef[];
};

export type VideoGenerationSubmissionRecord = {
  id: string;
  status: VideoGenerationStatus;
  progress: number;
  createdAt?: string;
  finishedAt?: string | null;
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function submitVideoGeneration({
  transaction,
  payload,
  ownerEmail,
  apiKeyId = null,
  graphNodeId = null,
  requestSnapshot,
  requestId = crypto.randomUUID(),
  inputAssetRefs,
  cinema,
}: SubmitVideoGenerationInput) {
  startGenerationWorker();
  const trimmedInitImage = payload.initImage?.trim() ?? "";
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
    if (trimmedInitImage || hasPotentialDynamicFile) {
      const model = hasPotentialDynamicFile
        ? (await getModelCatalog()).find((candidate) => candidate.type === "video" && candidate.key === payload.model)
        : undefined;
      uploaded = await uploadGenerationInputAssets(
        requestId,
        ownerEmail,
        generationInputMediaForPayload(
          "video",
          { ...payload, initImage: trimmedInitImage },
          model ?? { type: "video" },
        ),
      );
    }
  }
  const recordPayload = requestSnapshot
    ? payload
    : applyUploadedGenerationInputAssets({ ...payload, initImage: trimmedInitImage }, uploaded);
  try {
    const record = transaction
      ? await createVideoGenerationRecord(requestId, recordPayload, ownerEmail, apiKeyId, graphNodeId, requestSnapshot, inputAssetRefs, cinema, transaction)
      : cinema
      ? await createVideoGenerationRecord(requestId, recordPayload, ownerEmail, apiKeyId, graphNodeId, requestSnapshot, inputAssetRefs ?? (uploaded.length ? uploaded.map(({ ref }) => ref) : undefined), cinema)
      : graphNodeId || requestSnapshot
      ? await createVideoGenerationRecord(
          requestId,
          recordPayload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
          inputAssetRefs,
        )
      : uploaded.length > 0
        ? await createVideoGenerationRecord(
            requestId,
            recordPayload,
            ownerEmail,
            apiKeyId,
            null,
            undefined,
            uploaded.map(({ ref }) => ref),
          )
        : await createVideoGenerationRecord(requestId, recordPayload, ownerEmail, apiKeyId);
    return {
      record: {
        id: record.requestId,
        status: record.status,
        progress: record.progress,
    createdAt: record.createdAt?.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
      } satisfies VideoGenerationSubmissionRecord,
    };
  } catch (error) {
    if (graphNodeId && isUniqueConstraintError(error)) throw new NodeExecutionActiveError();
    throw error;
  }
}
