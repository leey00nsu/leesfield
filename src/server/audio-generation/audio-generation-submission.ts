import { Prisma } from "@prisma/client";

import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationStatus } from "@/features/audio-generation/model/audio-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { NodeExecutionActiveError } from "@/server/node-executions/node-execution-errors";

import { createAudioGenerationRecord } from "./audio-generation-repository";

export type SubmitAudioGenerationInput = {
  payload: AudioGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>;
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
  requestSnapshot,
}: SubmitAudioGenerationInput) {
  startGenerationWorker();
  const requestId = crypto.randomUUID();
  try {
    const record = graphNodeId || requestSnapshot
      ? await createAudioGenerationRecord(
          requestId,
          payload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
        )
      : await createAudioGenerationRecord(requestId, payload, ownerEmail, apiKeyId);
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
