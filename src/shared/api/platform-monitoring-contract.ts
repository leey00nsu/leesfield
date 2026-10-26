import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { externalHistoryDetailSchema } from "./platform-contract";
extendZodWithOpenApi(z);
export const externalMonitoringQuerySchema = z.object({
  scope: z.enum(["owner", "all"]).optional(),
  type: z.enum(["image", "video", "audio", "assistant", "all"]).optional(), status: z.string().optional(),
  model: z.string().optional(), apiKeyId: z.string().optional(), query: z.string().optional(), q: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(), tz: z.string().optional(),
  limit: z.string().optional(), offset: z.string().optional(), includeTotal: z.string().optional(),
  metric: z.enum(["requests", "errors", "latency"]).optional(),
});
const metricFilters = externalMonitoringQuerySchema.pick({
  scope: true, type: true, status: true, model: true, apiKeyId: true,
  from: true, to: true, tz: true,
});
export const externalMonitoringOperationQueries = {
  overview: metricFilters,
  stats: metricFilters,
  requests: metricFilters.extend(externalMonitoringQuerySchema.pick({
    query: true, q: true, limit: true, offset: true, includeTotal: true,
  }).shape),
  top: metricFilters.extend(externalMonitoringQuerySchema.pick({ limit: true, metric: true }).shape),
  "api-keys": externalMonitoringQuerySchema.pick({ scope: true, limit: true, offset: true }),
  "requests/detail": externalMonitoringQuerySchema.pick({ scope: true }).extend({
    type: z.enum(["image", "video", "audio", "assistant"]), requestId: z.string().min(1),
  }),
};
const latency = { avgLatencyMs: z.number().nullable(), p95LatencyMs: z.number().nullable() };
export const externalMonitoringOverviewSchema = z.object({
  activeCount: z.number(), totalCount: z.number(), failedCount: z.number(), errorRate: z.number(), ...latency,
  usageByType: z.object({ image: z.number(), video: z.number(), audio: z.number(), assistant: z.number(), other: z.number() }),
});
export const externalMonitoringStatsSchema = z.object({
  items: z.array(z.object({ day: z.string(), total: z.number(), failed: z.number(), errorRate: z.number(), ...latency })),
});
export const externalMonitoringRequestsSchema = z.object({
  updatedAt: z.string(), total: z.number().nullable(), limit: z.number(), offset: z.number(),
  items: z.array(z.object({ id: z.string(), type: z.enum(["image", "video", "audio", "assistant"]), status: z.string(),
    model: z.string().nullable(), createdAt: z.string(), finishedAt: z.string().nullable().optional(), durationMs: z.number().nullable(), apiKeyLabel: z.string() })),
});
const top = z.object({ key: z.string(), label: z.string(), total: z.number(), failed: z.number(), errorRate: z.number(), ...latency });
export const externalMonitoringTopSchema = z.object({
  metric: z.enum(["requests", "errors", "latency"]), limit: z.number(), models: z.array(top), apiKeys: z.array(top),
});
export const externalMonitoringDetailSchema = externalHistoryDetailSchema.omit({ origin: true });
export const externalMonitoringApiKeysSchema = z.object({
  items: z.array(z.object({ id: z.string(), label: z.string(), maskedKey: z.string(), status: z.enum(["active", "revoked"]) })),
  limit: z.number(), offset: z.number(),
});
