import { z } from "zod";

export const queueJobKinds = ["generate_image", "generate_video", "generate_audio", "media_operation", "assistant", "storage_cleanup"] as const;
export const queueJobStatuses = ["suspended", "ready", "retry_wait", "active", "succeeded", "dead_letter", "reconciliation_required", "cancelled", "abandoned"] as const;
export const queueOrigins = ["classic", "space", "external_api", "storage_cleanup", "unknown"] as const;
export type ConsoleKind = typeof queueJobKinds[number];
export type ConsoleStatus = typeof queueJobStatuses[number];
export type ConsoleOrigin = typeof queueOrigins[number];
const identifier = z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f]+$/);
export const consoleQuerySchema = z.object({
  kind: z.enum(queueJobKinds).optional(), status: z.enum([...queueJobStatuses, "blocked"]).optional(),
  model: identifier.optional(), resource: identifier.optional(), origin: z.enum(queueOrigins).optional(),
  worker: z.string().uuid().optional(), q: identifier.optional(),
  view: z.enum(["current", "history"]).default("current"),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
}).strict();
export type ConsoleQueryInput = z.input<typeof consoleQuerySchema>;
export type ConsoleQuery = z.output<typeof consoleQuerySchema>;
export const consoleFailedQuerySchema = consoleQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(["unresolved", "redriving", "resolved", "abandoned", "all"]).default("unresolved"),
  classification: z.enum(["terminal", "reconciliation"]).optional(), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,119}$/).optional(),
});
export const consoleChildQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() }).strict();
export type ConsoleReason = "QUEUE_PAUSED" | "RETRY_DELAY" | "SCHEDULED" | "GROUP_CLOSED" | "GROUP_BLOCKED" | "MODEL_UNAVAILABLE" | "RESOURCE_FULL" | "CANCEL_REQUESTED" | "CONDITIONS_PENDING";
export type ConsoleJob = {
  id: string; kind: ConsoleKind; status: ConsoleStatus; version: number; cycle: number;
  sourceType: string; sourceId: string; sourceRevision: number; executionType: string; executionId: string;
  createdAt: string; updatedAt: string; availableAt: string; cancelRequestedAt: string | null;
  cycleAdmittedAt?: string | null; cycleStartedAt?: string | null; attemptCount?: number;
  title: string; origin: ConsoleOrigin; sourceAvailable: boolean; sourceStatus: string | null; model: string | null;
  sourceRequestId: string | null; requestId: string | null;
  graphId: string | null; nodeId: string | null;
  group: { id: string; sequence: string | null; head: string; closedAt: string | null; blockedByJobId: string | null } | null;
  resources: string[]; primaryReason: ConsoleReason | null; reasons: ConsoleReason[];
  attempt: { id: string; ordinal: number; cycle: number; phase: string; workerInstanceId: string; startedAt: string; finishedAt: string | null; heartbeatAt: string; leaseUntil: string } | null;
};
export type ConsolePage<T> = { sampledAt: string; items: T[]; nextCursor: string | null };
export type ConsoleResource = {
  key: string; modelKey: string | null; capacity: number; reserved: number; uncertain: number; available: number; excess: number;
  capacitySource: "database" | "policy_default";
};
export type ConsoleOccupant = {
  resourceKey: string; attemptId: string; jobId: string; kind: ConsoleKind; status: ConsoleStatus; executionId: string;
  title?: string; model?: string | null; origin?: ConsoleOrigin;
  workerInstanceId: string; disposition: "held" | "uncertain"; startedAt: string; finishedAt: string | null;
};
export type ConsoleOverview = {
  sampledAt: string; scope: "database_global"; runtime: { mode: "paused" | "shared"; epoch: number; migrationVerified: boolean };
  byKind: Record<ConsoleKind, { states: Partial<Record<ConsoleStatus | "blocked", number>>; oldestPendingAt: string | null }>;
  counts: { pending: number; active: number; suspended: number; unresolvedJobs: number; reconciliationJobs: number; uncertainJobs: number };
  resources: ConsoleResource[]; resourcesTruncated: boolean; occupants: ConsoleOccupant[]; occupantsTruncated: boolean;
  process: { scope: "responding_process"; sampledAt: string; started: boolean; stopping: boolean; workerInstanceId: string; lastHeartbeatAt: string | null; heartbeatAgeSeconds: number | null };
};
export type ConsoleReservation = { resourceKey: string; disposition: "held" | "uncertain"; createdAt: string; releasedAt: string | null };
export type ConsoleAttempt = {
  id: string; jobId: string; lifetimeOrdinal: number; cycle: number; cycleOrdinal: number; executionType: string; executionId: string;
  workerInstanceId: string; phase: string; outcome: string | null; startedAt: string; finishedAt: string | null;
  heartbeatAt: string; leaseUntil: string; imported: boolean; reservations: ConsoleReservation[];
};
export type ConsoleDeadLetter = {
  id: string; jobId: string; failedAttemptId: string; classification: "terminal" | "reconciliation";
  state: "open" | "redriven" | "resolved" | "abandoned"; safeErrorCode: string; phase: string;
  version: number; createdAt: string; resolvedAt: string | null; detailPurgedAt: string | null;
};
export type ConsoleAction = {
  id: string; requestId: string; action: string; outcome: string; safeReason: string; createdAt: string;
  result: { code: string | null; status: string | null; cycle: number | null; executionId: string | null; mode: string | null };
};
export type ConsoleCleanup = {
  reason: string; status: string; storageProvider: string; storageObjectId: string | null;
  assetId: string | null; fileName: string | null; mediaType: string | null; mimeType: string | null; bytes: string | null;
  assetStatus: string | null; attempts: number; retryAt: string; lastError: string | null;
  protection: "linked" | "referenced" | "completed_asset" | "upload_grace" | null;
  usage: { graphs: number; operations: number; generations: number; assistants: number; projectCovers: number };
};
export type ConsoleJobDetail = ConsoleJob & {
  cleanup?: ConsoleCleanup | null;
  sampledAt: string; counts: { attempts: number; deadLetters: number; actions: number };
  maxAttempts: number; retryDelayMs: number; phase: string; cycleAdmittedAt: string | null; currentDeadLetter: ConsoleDeadLetter | null; latestDeadLetter: ConsoleDeadLetter | null;
};
export type ConsoleFailedJob = ConsoleJob & { failureCount: number; entry: ConsoleDeadLetter; currentEntry: ConsoleDeadLetter | null };
export type ConsoleTimelineItem = ConsoleAttempt & {
  job: ConsoleJob; admittedAt: string | null; waitFrom: string | null; clippedStart: boolean; clippedEnd: boolean;
};
export type ConsoleTimeline = ConsolePage<ConsoleTimelineItem> & { from: string; to: string };
export type ConsoleCapability = { status: "available" | "requires_validation" | "blocked"; reasons: string[]; evidenceRef?: string };
export type ConsoleCapabilities = {
  checkedAt: string; jobId: string; entryId: string; entryVersion: number; jobVersion: number;
  redrive: ConsoleCapability; reconcile: ConsoleCapability; abandon: ConsoleCapability;
};
