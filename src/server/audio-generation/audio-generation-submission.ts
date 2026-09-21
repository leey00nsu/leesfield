import { Prisma } from "@prisma/client";

import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationStatus } from "@/features/audio-generation/model/audio-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { NodeExecutionActiveError } from "@/server/node-executions/node-execution-errors";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import {
  applyUploadedGenerationInputAssets,
  generationInputMediaForPayload,
  uploadGenerationInputAssets,
} from "@/server/shared/input-media-uploader";

import { createAudioGenerationRecord } from "./audio-generation-repository";

export type SubmitAudioGenerationInput = {
  payload: AudioGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
  /** Reserved by the admission ledger so a retry reuses one request. */
  requestId?: string;
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>;
  inputAssetRefs?: import("@/server/generation-request/generation-input-assets").GenerationInputAssetRef[];
};

export type AudioGenerationSubmissionRecord = {
  id: string;
  status: AudioGenerationStatus;
  progress: number;
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function submitAudioGeneration({
  payload,
  ownerEmail,
  apiKeyId = null,
  graphNodeId = null,
  requestId: reservedRequestId,
  requestSnapshot,
  inputAssetRefs,
}: SubmitAudioGenerationInput) {
  startGenerationWorker();
  const requestId = reservedRequestId ?? crypto.randomUUID();
  const trimmedInputAudio = payload.inputAudio?.trim() ?? "";
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
    if (trimmedInputAudio || hasPotentialDynamicFile) {
      const model = hasPotentialDynamicFile
        ? (await getModelCatalog()).find((candidate) => candidate.type === "audio" && candidate.key === payload.model)
        : undefined;
      uploaded = await uploadGenerationInputAssets(
        requestId,
        ownerEmail,
        generationInputMediaForPayload(
          "audio",
          { ...payload, inputAudio: trimmedInputAudio },
          model ?? { type: "audio" },
        ),
      );
    }
  }
  const recordPayload = requestSnapshot
    ? payload
    : applyUploadedGenerationInputAssets({ ...payload, inputAudio: trimmedInputAudio }, uploaded);
  try {
    const record = graphNodeId || requestSnapshot
      ? await createAudioGenerationRecord(
          requestId,
          recordPayload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
          inputAssetRefs,
        )
      : uploaded.length > 0
        ? await createAudioGenerationRecord(
            requestId,
            recordPayload,
            ownerEmail,
            apiKeyId,
            null,
            undefined,
            uploaded.map(({ ref }) => ref),
          )
        : await createAudioGenerationRecord(requestId, recordPayload, ownerEmail, apiKeyId);
    return {
      record: {
        id: record.requestId,
        status: record.status,
        progress: record.progress,
      } satisfies AudioGenerationSubmissionRecord,
    };
  } catch (error) {
    if (graphNodeId && isUniqueConstraintError(error)) throw new NodeExecutionActiveError();
    throw error;
  }
}
