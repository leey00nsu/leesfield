import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import {
  createImageGenerationRecord,
  saveImageGenerationResult,
} from "@/server/image-generation/image-generation-repository";

export type ImageGenerationRecord = {
  id: string;
  dbId?: string;
  ownerEmail?: string;
  payload: ImageGenerationFormValues;
  status: ImageGenerationStatus;
  progress: number;
  finalizing?: boolean;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  result?: ImageGenerationResponse["result"];
};

type Store = Map<string, ImageGenerationRecord>;

declare global {
  var __imageGenerationStore: Store | undefined;
}

const store: Store = globalThis.__imageGenerationStore ?? new Map();

globalThis.__imageGenerationStore = store;

const PROGRESS_STAGES: Array<{
  at: number;
  status: ImageGenerationStatus;
  progress: number;
}> = [
  { at: 0, status: "pending", progress: 0 },
  { at: 200, status: "processing", progress: 12 },
  { at: 450, status: "processing", progress: 42 },
  { at: 750, status: "processing", progress: 74 },
  { at: 1000, status: "processing", progress: 92 },
];

const EXPIRY_MS = 10 * 60 * 1000;
const FINALIZE_DELAY = 1200;

function updateRecord(id: string, patch: Partial<ImageGenerationRecord>) {
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

export function createMockGeneration(
  payload: ImageGenerationFormValues,
  ownerEmail: string,
): Promise<ImageGenerationRecord> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: ImageGenerationRecord = {
    id,
    ownerEmail,
    payload,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, record);

  return createImageGenerationRecord(id, payload, ownerEmail)
    .then((dbRecord) => {
      updateRecord(id, { dbId: dbRecord.id });
      return store.get(id) ?? record;
    })
    .catch((error) => {
      store.delete(id);
      throw error;
    });
}

export async function getGeneration(id: string, ownerEmail: string) {
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
          const result = await resolveImageGenerationResult(
            latest.payload,
            latest.id
          );
          let dbErrorMessage: string | undefined;

          if (latest.dbId) {
            try {
              await saveImageGenerationResult(
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
              console.error("[image-generation] db save failed", error);
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
