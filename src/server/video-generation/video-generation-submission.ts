import { Prisma } from "@prisma/client";

import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationStatus } from "@/features/video-generation/model/video-generation-types";
import { startGenerationWorker } from "@/server/generation-worker/generation-worker";
import { NodeExecutionActiveError } from "@/server/node-executions/node-execution-errors";

import { createVideoGenerationRecord } from "./video-generation-repository";

export type SubmitVideoGenerationInput = {
  payload: VideoGenerationFormValues;
  ownerEmail: string;
  apiKeyId?: string | null;
  graphNodeId?: string | null;
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>;
  requestId?: string;
};

export type VideoGenerationSubmissionRecord = {
  id: string;
  status: VideoGenerationStatus;
  progress: number;
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function submitVideoGeneration({
  payload,
  ownerEmail,
  apiKeyId = null,
  graphNodeId = null,
  requestSnapshot,
  requestId = crypto.randomUUID(),
}: SubmitVideoGenerationInput) {
  startGenerationWorker();
  try {
    const record = graphNodeId || requestSnapshot
      ? await createVideoGenerationRecord(
          requestId,
          payload,
          ownerEmail,
          apiKeyId,
          graphNodeId,
          requestSnapshot,
        )
      : await createVideoGenerationRecord(requestId, payload, ownerEmail, apiKeyId);
    return {
      record: {
        id: record.requestId,
        status: record.status,
        progress: record.progress,
      } satisfies VideoGenerationSubmissionRecord,
    };
  } catch (error) {
    if (graphNodeId && isUniqueConstraintError(error)) throw new NodeExecutionActiveError();
    throw error;
  }
}
