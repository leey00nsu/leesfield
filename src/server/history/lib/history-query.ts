import type { Prisma } from "@prisma/client";
import type {
  GenerationHistoryResponse,
  GenerationHistorySort,
  GenerationHistoryType,
} from "@/entities/generation/model/types";

export type HistoryType = GenerationHistoryType;
export type HistorySort = GenerationHistorySort;

export type HistoryQuery = {
  type: HistoryType;
  query: string;
  sort: HistorySort;
  limit: number;
  offset: number;
};

export type HistoryResponse = GenerationHistoryResponse;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

const HISTORY_TYPES = new Set<HistoryType>(["image", "video", "audio", "all"]);
const HISTORY_SORTS = new Set<HistorySort>(["date_desc", "date_asc"]);

function toNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function parseHistoryQuery(
  searchParams: URLSearchParams,
): HistoryQuery {
  const rawType = searchParams.get("type")?.toLowerCase() ?? "all";
  const type = HISTORY_TYPES.has(rawType as HistoryType)
    ? (rawType as HistoryType)
    : "all";

  const rawSort = searchParams.get("sort")?.toLowerCase() ?? "date_desc";
  const sort = HISTORY_SORTS.has(rawSort as HistorySort)
    ? (rawSort as HistorySort)
    : "date_desc";

  const query = searchParams.get("query")?.trim() ?? "";

  const limit = toNumber(searchParams.get("limit"));
  const offset = toNumber(searchParams.get("offset"));

  return {
    type,
    query,
    sort,
    limit: clamp(limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: Math.max(offset ?? 0, 0),
  };
}

export function buildImageWhere(
  query: HistoryQuery,
): Prisma.ImageGenerationWhereInput {
  if (!query.query) return {};

  return {
    OR: [
      {
        prompt: {
          contains: query.query,
          mode: "insensitive",
        },
      },
      {
        requestParams: {
          path: ["model"],
          string_contains: query.query,
        },
      },
    ],
  };
}

export function buildVideoWhere(
  query: HistoryQuery,
): Prisma.VideoGenerationWhereInput {
  if (!query.query) return {};

  return {
    OR: [
      {
        prompt: {
          contains: query.query,
          mode: "insensitive",
        },
      },
      {
        requestParams: {
          path: ["model"],
          string_contains: query.query,
        },
      },
    ],
  };
}

export function buildAudioWhere(
  query: HistoryQuery,
): Prisma.AudioGenerationWhereInput {
  if (!query.query) return {};

  return {
    OR: [
      {
        prompt: {
          contains: query.query,
          mode: "insensitive",
        },
      },
      {
        requestParams: {
          path: ["model"],
          string_contains: query.query,
        },
      },
    ],
  };
}

export function extractModel(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const record = params as Record<string, unknown>;
  return typeof record.model === "string" ? record.model : null;
}

export function extractInputImages(params: unknown): string[] {
  if (!params || typeof params !== "object") return [];
  const record = params as Record<string, unknown>;
  const images: string[] = [];
  if (Array.isArray(record.initImages)) {
    record.initImages.forEach((value) => {
      if (typeof value === "string" && value.trim()) {
        images.push(value.trim());
      }
    });
  }
  if (typeof record.initImage === "string" && record.initImage.trim()) {
    images.push(record.initImage.trim());
  }
  return images;
}

export function extractInputAudios(params: unknown): string[] {
  if (!params || typeof params !== "object") return [];
  const record = params as Record<string, unknown>;
  if (typeof record.inputAudio === "string" && record.inputAudio.trim()) {
    return [record.inputAudio.trim()];
  }
  return [];
}

export function extractReferenceText(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const record = params as Record<string, unknown>;
  return typeof record.referenceText === "string" && record.referenceText.trim()
    ? record.referenceText.trim()
    : null;
}

const FINISHED_STATUSES = new Set(["completed", "failed"]);

export function toHistoryDurationMs(
  createdAt: Date,
  updatedAt: Date,
  status: string,
) {
  if (!FINISHED_STATUSES.has(status)) return null;
  return Math.max(0, updatedAt.getTime() - createdAt.getTime());
}
