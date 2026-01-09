import type { Prisma } from "@prisma/client";

export type HistoryType = "image" | "video" | "all";
export type HistorySort = "date_desc" | "date_asc";
export type HistoryStatus = "pending" | "processing" | "completed" | "failed";

export type HistoryQuery = {
  type: HistoryType;
  query: string;
  sort: HistorySort;
  limit: number;
  offset: number;
};

export type HistoryItem = {
  id: string;
  type: "image" | "video";
  status: HistoryStatus;
  prompt: string;
  model: string | null;
  createdAt: string;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
};

export type HistoryResponse = {
  items: HistoryItem[];
  total: number;
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

const HISTORY_TYPES = new Set<HistoryType>(["image", "video", "all"]);
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

export function extractModel(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const record = params as Record<string, unknown>;
  return typeof record.model === "string" ? record.model : null;
}
