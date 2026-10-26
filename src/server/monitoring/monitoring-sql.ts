import { Prisma } from "@prisma/client";
import type {
  ApiKeyFilter,
  MonitoringStatus,
} from "@/server/monitoring/monitoring-query";

export const ACTIVE_STATUSES: MonitoringStatus[] = [
  "pending",
  "processing",
  "uploading",
];
export const FINISHED_STATUSES: MonitoringStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export type RawFilters = {
  ownerEmail?: string;
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
  if (filters.ownerEmail !== undefined) conditions.push(Prisma.sql`"ownerEmail" = ${filters.ownerEmail}`);

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

export function buildBaseSelect(
  table: "ImageGeneration" | "VideoGeneration" | "AudioGeneration",
  where: Prisma.Sql,
) {
  const tableName = Prisma.raw(`"${table}"`);
  return Prisma.sql`
    SELECT "createdAt", "finishedAt", "status"::text as "status", "modelKey", "apiKeyId"
    FROM ${tableName}
    ${where}
  `;
}

export function buildAssistantBaseSelect(where:Prisma.Sql) {return Prisma.sql`SELECT "createdAt","finishedAt","status","modelKey","apiKeyId" FROM (SELECT a."createdAt",a."finishedAt",a.status::text AS status,a."modelKey",a."ownerEmail",n."apiKeyId" FROM "AssistantExecution" a LEFT JOIN "NodeExecutionSubmission" n ON n."executionId"=a.id AND n."ownerEmail"=a."ownerEmail") s ${where}`;}
export function buildMonitoringBaseSelect(query:Pick<import("./monitoring-query").MonitoringQuery,"type"|"includeAssistant">,where:Prisma.Sql) {
  if(query.type==="assistant")return buildAssistantBaseSelect(where);
  const image=buildBaseSelect("ImageGeneration",where),video=buildBaseSelect("VideoGeneration",where),audio=buildBaseSelect("AudioGeneration",where);
  return query.type==="image"?image:query.type==="video"?video:query.type==="audio"?audio:Prisma.sql`${image} UNION ALL ${video} UNION ALL ${audio}${query.includeAssistant?Prisma.sql` UNION ALL ${buildAssistantBaseSelect(where)}`:Prisma.empty}`;
}
