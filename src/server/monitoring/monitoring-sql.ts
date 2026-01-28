import { Prisma } from "@prisma/client";
import type {
  ApiKeyFilter,
  MonitoringStatus,
} from "@/server/monitoring/monitoring-query";

export const ACTIVE_STATUSES: MonitoringStatus[] = [
  "pending",
  "processing",
];
export const FINISHED_STATUSES: MonitoringStatus[] = [
  "completed",
  "failed",
];

export type RawFilters = {
  statuses: MonitoringStatus[] | null;
  model: string | null;
  apiKey: ApiKeyFilter;
  from?: Date;
  to?: Date;
};

export function buildRawWhere(
  filters: RawFilters,
  options?: {
    includeDate?: boolean;
    includeStatus?: boolean;
  },
) {
  const conditions: Prisma.Sql[] = [];

  if (options?.includeDate && filters.from && filters.to) {
    conditions.push(
      Prisma.sql`"createdAt" >= ${filters.from} AND "createdAt" <= ${filters.to}`,
    );
  }

  if (filters.model) {
    conditions.push(Prisma.sql`"modelKey" = ${filters.model}`);
  }

  if (filters.apiKey.mode === "id") {
    conditions.push(Prisma.sql`"apiKeyId" = ${filters.apiKey.value}`);
  }

  if (filters.apiKey.mode === "ui") {
    conditions.push(Prisma.sql`"apiKeyId" IS NULL`);
  }

  if (options?.includeStatus && filters.statuses?.length) {
    conditions.push(
      Prisma.sql`"status" IN (${Prisma.join(filters.statuses)})`,
    );
  }

  if (conditions.length === 0) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export function buildBaseSelect(table: "ImageGeneration" | "VideoGeneration", where: Prisma.Sql) {
  const tableName = Prisma.raw(`"${table}"`);
  return Prisma.sql`
    SELECT "createdAt", "updatedAt", "status"::text as "status", "modelKey", "apiKeyId"
    FROM ${tableName}
    ${where}
  `;
}
