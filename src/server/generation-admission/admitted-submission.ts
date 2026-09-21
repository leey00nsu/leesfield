import { randomUUID } from "node:crypto";

import {
  beginSubmission,
  hashSubmissionPayload,
  type AdmissionRejectionReason,
} from "@/server/generation-admission/submission-ledger";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/** Reads the retry identifier a caller may attach to a resubmission. */
export function readIdempotencyKey(request: Request): string | null {
  const raw =
    request.headers.get("idempotency-key") ??
    request.headers.get("x-idempotency-key");
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (value.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  return /^[\x21-\x7e]+$/.test(value) ? value : null;
}

export type AdmissionOutcome =
  | { kind: "proceed"; requestId: string }
  | { kind: "reuse"; requestId: string }
  | { kind: "conflict"; requestId: string }
  | { kind: "model-unavailable" }
  | { kind: "rejected"; reason: AdmissionRejectionReason };

export type AdmitSubmissionInput = {
  request: Request;
  ownerEmail: string;
  apiKeyId?: string | null;
  payload: unknown;
  providerKey?: string | null;
  modelKey?: string | null;
  modelType?: "image" | "video" | "audio";
  graphNodeId?: string | null;
};

/**
 * Reserves queue capacity and resolves retry semantics before any file upload
 * or provider call. Failed attempts are atomically reclaimed by the ledger and
 * returned as "created", keeping the original request id for the one winner.
 */
export async function admitSubmission(
  input: AdmitSubmissionInput,
): Promise<AdmissionOutcome> {
  const idempotencyKey = readIdempotencyKey(input.request);
  const payloadHash = hashSubmissionPayload(input.payload);

  const result = await beginSubmission({
    requestId: randomUUID(),
    ownerEmail: input.ownerEmail,
    apiKeyId: input.apiKeyId ?? null,
    idempotencyKey,
    payloadHash,
    providerKey: input.providerKey ?? null,
    modelKey: input.modelKey ?? null,
    modelType: input.modelType,
    graphNodeId: input.graphNodeId ?? null,
  });

  switch (result.kind) {
    case "created":
      return { kind: "proceed", requestId: result.requestId };
    case "existing":
      return { kind: "reuse", requestId: result.requestId };
    case "conflict":
      return { kind: "conflict", requestId: result.requestId };
    case "model-unavailable":
      return { kind: "model-unavailable" };
    case "rejected":
      return { kind: "rejected", reason: result.reason };
  }
}
