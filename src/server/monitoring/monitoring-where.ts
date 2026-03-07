import type { Prisma } from "@prisma/client";
import type { ApiKeyFilter, MonitoringStatus } from "@/server/monitoring/monitoring-query";

export type MonitoringWhereFilters = {
  statuses: MonitoringStatus[] | null;
  model: string | null;
  apiKey: ApiKeyFilter;
  from?: Date;
  to?: Date;
  query?: string | null;
};

type WhereOptions = {
  includeDate?: boolean;
  includeStatus?: boolean;
  includeQuery?: boolean;
};

function applyCommonFilters<
  T extends
    | Prisma.ImageGenerationWhereInput
    | Prisma.VideoGenerationWhereInput
    | Prisma.AudioGenerationWhereInput,
>(
  where: T,
  filters: MonitoringWhereFilters,
  options?: WhereOptions,
) {
  if (filters.model) {
    (where as Prisma.ImageGenerationWhereInput).modelKey = filters.model;
  }

  if (filters.apiKey.mode === "id") {
    (where as Prisma.ImageGenerationWhereInput).apiKeyId = filters.apiKey.value;
  }

  if (filters.apiKey.mode === "ui") {
    (where as Prisma.ImageGenerationWhereInput).apiKeyId = null;
  }

  if (options?.includeDate && filters.from && filters.to) {
    (where as Prisma.ImageGenerationWhereInput).createdAt = {
      gte: filters.from,
      lte: filters.to,
    };
  }

  if (options?.includeStatus && filters.statuses?.length) {
    (where as Prisma.ImageGenerationWhereInput).status = {
      in: filters.statuses,
    };
  }

  if (options?.includeQuery && filters.query) {
    (where as Prisma.ImageGenerationWhereInput).OR = [
      {
        prompt: {
          contains: filters.query,
          mode: "insensitive",
        },
      },
      {
        modelKey: {
          contains: filters.query,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

export function buildImageWhere(
  filters: MonitoringWhereFilters,
  options?: WhereOptions,
): Prisma.ImageGenerationWhereInput {
  const where: Prisma.ImageGenerationWhereInput = {};
  return applyCommonFilters(where, filters, options);
}

export function buildVideoWhere(
  filters: MonitoringWhereFilters,
  options?: WhereOptions,
): Prisma.VideoGenerationWhereInput {
  const where: Prisma.VideoGenerationWhereInput = {};
  return applyCommonFilters(where, filters, options);
}

export function buildAudioWhere(
  filters: MonitoringWhereFilters,
  options?: WhereOptions,
): Prisma.AudioGenerationWhereInput {
  const where: Prisma.AudioGenerationWhereInput = {};
  return applyCommonFilters(where, filters, options);
}
