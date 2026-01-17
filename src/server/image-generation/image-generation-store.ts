import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";
import { prisma } from "@/server/db/prisma";
import {
  createImageGenerationRecord,
  getImageGenerationByRequestId,
} from "@/server/image-generation/image-generation-repository";

export type ImageGenerationRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
};

const ACTIVE_STATUSES: ImageGenerationStatus[] = [
  "pending",
  "processing",
];
const EXPIRY_MS = 10 * 60 * 1000;
const reservationLocks = new Map<string, Promise<void>>();

async function withReservationLock<T>(key: string, task: () => Promise<T>) {
  const previous = reservationLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  reservationLocks.set(key, previous.then(() => current));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (reservationLocks.get(key) === current) {
      reservationLocks.delete(key);
    }
  }
}

function buildReservationKey(
  ownerEmail: string,
  model: ImageGenerationFormValues["model"],
) {
  return `${ownerEmail}:${model}`;
}

function mapRecord(
  record: Awaited<ReturnType<typeof getImageGenerationByRequestId>>,
): ImageGenerationRecord | null {
  if (!record) return null;
  const images = record.images ?? [];
  const result = images.length
    ? {
        images: images.map((image) => ({
          url: image.url,
          width: image.width ?? undefined,
          height: image.height ?? undefined,
        })),
      }
    : undefined;

  return {
    id: record.requestId,
    status: record.status,
    progress: record.progress,
    result,
    errorMessage: record.errorMessage ?? undefined,
  };
}

export async function findActiveImageGenerations(
  ownerEmail: string,
  model: ImageGenerationFormValues["model"],
) {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const where = {
    ownerEmail,
    status: { in: ACTIVE_STATUSES },
    updatedAt: { gt: cutoff },
    requestParams: {
      path: ["model"],
      equals: model,
    },
  };

  const [count, latest] = await prisma.$transaction([
    prisma.imageGeneration.count({ where }),
    prisma.imageGeneration.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    count,
    latest: latest
      ? ({
          id: latest.requestId,
          status: latest.status,
          progress: latest.progress,
        } satisfies ImageGenerationRecord)
      : null,
  };
}

export async function createMockGenerationWithLimit(
  payload: ImageGenerationFormValues,
  ownerEmail: string,
  limit: number,
) {
  const requestId = crypto.randomUUID();

  if (!Number.isFinite(limit) || limit <= 0) {
    const record = await createImageGenerationRecord(
      requestId,
      payload,
      ownerEmail,
    );
    return {
      record: {
        id: record.requestId,
        status: record.status,
        progress: record.progress,
      } satisfies ImageGenerationRecord,
      latest: null,
    };
  }

  return withReservationLock(
    buildReservationKey(ownerEmail, payload.model),
    async () => {
      const active = await findActiveImageGenerations(ownerEmail, payload.model);
      if (active.count >= limit) {
        return { record: null, latest: active.latest };
      }
      const record = await createImageGenerationRecord(
        requestId,
        payload,
        ownerEmail,
      );
      return {
        record: {
          id: record.requestId,
          status: record.status,
          progress: record.progress,
        } satisfies ImageGenerationRecord,
        latest: null,
      };
    },
  );
}

export async function getGeneration(id: string, ownerEmail: string) {
  const record = await getImageGenerationByRequestId(id, ownerEmail);
  return mapRecord(record);
}
