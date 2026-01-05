import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import { resolveModalVideoGenerationResult } from "@/server/video-generation/modal-generation";

export type VideoGenerationRecord = {
  id: string;
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
  // eslint-disable-next-line no-var
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
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: VideoGenerationRecord = {
    id,
    payload,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, record);
  return record;
}

export async function getVideoGeneration(id: string) {
  const record = store.get(id);
  if (!record) {
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
          const result = await resolveModalVideoGenerationResult(
            latest.payload,
            latest.id
          );

          updateRecord(id, {
            status: result.status,
            progress: result.status === "completed" ? 100 : latest.progress,
            result: result.result,
            errorMessage: result.errorMessage,
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
