import { z } from "zod";

import { queueJobKinds } from "@/shared/api/job-queue-console-contract";
export { queueJobKinds };
export type QueueJobKind = (typeof queueJobKinds)[number];

export const queueSourceTypes = [
  "image_generation", "video_generation", "audio_generation",
  "media_operation", "assistant_execution", "storage_cleanup",
] as const;
export type QueueSourceType = (typeof queueSourceTypes)[number];

export const QUEUE_POLL_INTERVAL_MS = 2_000;
export const QUEUE_LEASE_MS = 60_000;
export const QUEUE_HEARTBEAT_MS = 10_000;
export const QUEUE_DRAIN_TIMEOUT_MS = 25_000;
export const QUEUE_SCAN_LIMIT = 60;
export const QUEUE_TRANSACTION_LOCK = "leesfield:shared-job-queue";

export class QueueContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "QueueContractError";
  }
}

const identifier = z.string().min(1).max(200).refine(
  value => value === value.trim() && !/[\u0000-\u001f]/.test(value),
  "Invalid queue identifier",
);

export const queueSourceSchema = z.object({
  type: z.enum(queueSourceTypes),
  id: identifier,
  revision: z.number().int().min(0).default(0),
}).strict();

export const queueResourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("static"),
    key: identifier,
    capacity: z.number().int().min(0).max(1_000),
  }).strict(),
  z.object({
    type: z.literal("model"),
    key: identifier,
    modelType: z.enum(["image", "video", "audio", "llm"]),
    modelKey: identifier,
  }).strict(),
]);
export type QueueResourceRequirement = z.infer<typeof queueResourceSchema>;

export type QueueLease = {
  jobId: string;
  attemptId: string;
  token: string;
  version: number;
  runtimeEpoch: number;
};

export type QueueFailure = {
  code: string;
  phase: string;
  disposition: "retry" | "terminal" | "reconciliation";
  /** Must be backed by provider/process evidence, never just lease expiry. */
  executionStopped: boolean;
  remoteEvidenceRef?: string;
};
