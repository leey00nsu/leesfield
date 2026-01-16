import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import {
  createVideoGenerationRecord,
  saveVideoGenerationResult,
} from "@/server/video-generation/video-generation-repository";

export type VideoGenerationRecord = {
  id: string;
  dbId?: string;
  ownerEmail?: string;
  payload: VideoGenerationFormValues;
  status: VideoGenerationStatus;
  progress: number;
  finalizing?: boolean;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  result?: VideoGenerationResponse["result"];
};

type Store = Map<string, VideoGenerationRecord>;

declare global {
  var __videoGenerationStore: Store | undefined;
}

const store: Store = globalThis.__videoGenerationStore ?? new Map();

globalThis.__videoGenerationStore = store;

const PROGRESS_STAGES: Array<{
  at: number;
  status: VideoGenerationStatus;
  progress: number;
}> = [
  { at: 0, status: "pending", progress: 0 },
  { at: 400, status: "processing", progress: 18 },
  { at: 900, status: "processing", progress: 46 },
  { at: 1500, status: "processing", progress: 74 },
  { at: 2200, status: "processing", progress: 92 },
];

const EXPIRY_MS = 10 * 60 * 1000;
const FINALIZE_DELAY = 2600;
const TERMINAL_STATUSES: Array<VideoGenerationRecord["status"]> = [
  "completed",
  "failed",
];

function updateRecord(id: string, patch: Partial<VideoGenerationRecord>) {
  const current = store.get(id);
  if (!current) return;
  store.set(id, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

function resolveProgressStage(elapsedMs: number) {
  let stage = PROGRESS_STAGES[0];
  for (const candidate of PROGRESS_STAGES) {
    if (elapsedMs >= candidate.at) {
      stage = candidate;
    }
  }
  return stage;
}

export async function createMockVideoGeneration(
  payload: VideoGenerationFormValues,
  ownerEmail: string,
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: VideoGenerationRecord = {
    id,
    ownerEmail,
    payload,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, record);

  return createVideoGenerationRecord(id, payload, ownerEmail)
    .then((dbRecord) => {
      updateRecord(id, { dbId: dbRecord.id });
      return store.get(id) ?? record;
    })
    .catch((error) => {
      store.delete(id);
      throw error;
    });
}

export function findActiveVideoGenerations(
  ownerEmail: string,
  model: VideoGenerationFormValues["model"],
) {
  let count = 0;
  let latest: VideoGenerationRecord | null = null;
  const now = Date.now();

  for (const record of store.values()) {
    if (record.ownerEmail !== ownerEmail) continue;
    if (record.payload.model !== model) continue;
    if (now - record.createdAt > EXPIRY_MS) {
      store.delete(record.id);
      continue;
    }
    if (TERMINAL_STATUSES.includes(record.status)) continue;
    count += 1;
    if (!latest || record.updatedAt > latest.updatedAt) {
      latest = record;
    }
  }

  return { count, latest };
}

export async function getVideoGeneration(id: string, ownerEmail: string) {
  const record = store.get(id);
  if (!record || record.ownerEmail !== ownerEmail) {
    return null;
  }

  const elapsed = Date.now() - record.createdAt;
  if (elapsed > EXPIRY_MS) {
    store.delete(id);
    return null;
  }

  if (record.status !== "completed" && record.status !== "failed") {
    const stage = resolveProgressStage(elapsed);
    if (record.progress !== stage.progress || record.status !== stage.status) {
      updateRecord(id, {
        status: stage.status,
        progress: stage.progress,
      });
    }

    const nextRecord = store.get(id) ?? record;
    if (elapsed >= FINALIZE_DELAY && !nextRecord.finalizing) {
      updateRecord(id, { finalizing: true });
      const latest = store.get(id) ?? nextRecord;

      void (async () => {
        try {
          const result = await resolveVideoGenerationResult(
            latest.payload,
            latest.id
          );
          let dbErrorMessage: string | undefined;

          if (latest.dbId && !result.skipDbSave) {
            try {
              await saveVideoGenerationResult(
                latest.dbId,
                result.status,
                result.status === "completed" ? 100 : latest.progress,
                result.result,
                result.errorMessage,
              );
            } catch (error) {
              dbErrorMessage =
                error instanceof Error
                  ? error.message
                  : "DB 저장에 실패했습니다.";
              console.error("[video-generation] db save failed", error);
            }
          }

          const mergedErrorMessage = [result.errorMessage, dbErrorMessage]
            .filter(Boolean)
            .join(" / ");

          updateRecord(id, {
            status: result.status,
            progress: result.status === "completed" ? 100 : latest.progress,
            result: result.result,
            errorMessage: mergedErrorMessage || undefined,
            finalizing: false,
          });
        } catch (error) {
          updateRecord(id, {
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : "생성에 실패했습니다.",
            finalizing: false,
          });
        }
      })();
    }
  }

  return store.get(id) ?? record;
}
