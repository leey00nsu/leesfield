import {
  QueueContractError,
  type QueueJobKind,
  type QueueSourceType,
} from "./contracts";

type KindDefinition = {
  sourceType: QueueSourceType;
  pool: string;
  capacity: number;
  maxAttempts: number;
  retryDelayMs: number;
};

/** Product policies live here, not in individual polling workers. */
export const queueKindDefinitions = {
  generate_image: { sourceType: "image_generation", pool: "generation", capacity: 4, maxAttempts: 1, retryDelayMs: 0 },
  generate_video: { sourceType: "video_generation", pool: "generation", capacity: 4, maxAttempts: 1, retryDelayMs: 0 },
  generate_audio: { sourceType: "audio_generation", pool: "generation", capacity: 4, maxAttempts: 1, retryDelayMs: 0 },
  media_operation: { sourceType: "media_operation", pool: "media-operation", capacity: 2, maxAttempts: 1, retryDelayMs: 0 },
  assistant: { sourceType: "assistant_execution", pool: "assistant", capacity: 4, maxAttempts: 1, retryDelayMs: 0 },
  storage_cleanup: { sourceType: "storage_cleanup", pool: "storage-cleanup", capacity: 2, maxAttempts: 5, retryDelayMs: 60_000 },
} as const satisfies Record<QueueJobKind, KindDefinition>;

export function queueKindDefinition(kind: QueueJobKind): KindDefinition {
  const definition = queueKindDefinitions[kind];
  if (!definition) throw new QueueContractError("QUEUE_KIND_UNSUPPORTED");
  return definition;
}

export function assertQueueSource(kind: QueueJobKind, sourceType: QueueSourceType) {
  if (queueKindDefinition(kind).sourceType !== sourceType) {
    throw new QueueContractError("QUEUE_SOURCE_KIND_MISMATCH");
  }
}
