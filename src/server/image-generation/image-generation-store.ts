import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";

export type ImageGenerationRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  result?: ImageGenerationResponse["result"];
};

type Store = Map<string, ImageGenerationRecord>;

declare global {
  // eslint-disable-next-line no-var
  var __imageGenerationStore: Store | undefined;
}

const store: Store = globalThis.__imageGenerationStore ?? new Map();

globalThis.__imageGenerationStore = store;

const MOCK_STEPS: Array<{ delay: number; status: ImageGenerationStatus; progress: number }> = [
  { delay: 400, status: "processing", progress: 12 },
  { delay: 1400, status: "processing", progress: 42 },
  { delay: 2600, status: "processing", progress: 74 },
  { delay: 3600, status: "completed", progress: 100 },
];

const EXPIRY_MS = 10 * 60 * 1000;

function updateRecord(id: string, patch: Partial<ImageGenerationRecord>) {
  const current = store.get(id);
  if (!current) return;
  store.set(id, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

function scheduleMockLifecycle(id: string) {
  MOCK_STEPS.forEach((step) => {
    setTimeout(() => {
      if (!store.has(id)) return;
      updateRecord(id, {
        status: step.status,
        progress: step.progress,
        result:
          step.status === "completed"
            ? {
                images: [],
              }
            : undefined,
      });
    }, step.delay);
  });

  setTimeout(() => {
    store.delete(id);
  }, EXPIRY_MS);
}

export function createMockGeneration(
  _payload: ImageGenerationFormValues,
): ImageGenerationRecord {
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: ImageGenerationRecord = {
    id,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, record);
  scheduleMockLifecycle(id);

  return record;
}

export function getGeneration(id: string) {
  return store.get(id) ?? null;
}
