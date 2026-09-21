import { apiKeyHeader } from "@/shared/api/external-contract";
import { buildErrorResponse } from "@/server/http/response";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";

/** The usage timestamp is an operational signal, not an audit log. */
export const API_KEY_LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export type ApiKeyAuthContext = {
  apiKeyId: string;
  ownerEmail: string;
};

/**
 * Coalesces hot-row writes across processes with a conditional UPDATE. The
 * authentication query remains authoritative and this best-effort telemetry
 * must never turn an otherwise valid request into an authentication failure.
 */
export async function touchApiKeyLastUsedAt(
  apiKeyId: string,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - API_KEY_LAST_USED_WRITE_INTERVAL_MS,
  );
  try {
    await prisma.apiKey.updateMany({
      where: {
        id: apiKeyId,
        status: "active",
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
      },
      data: { lastUsedAt: now },
    });
  } catch {
    // lastUsedAt is observability metadata; do not fail an authenticated call.
  }
}

export async function requireApiKey(
  request: Request,
): Promise<ApiKeyAuthContext | NextResponse> {
  const rawKey = request.headers.get(apiKeyHeader);
  const apiKey = rawKey?.trim() ?? "";

  if (!apiKey) {
    return buildErrorResponse("API_KEY_REQUIRED", 401);
  }

  const keyHash = hashApiKey(apiKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!record) {
    return buildErrorResponse("INVALID_API_KEY", 403);
  }

  if (record.status !== "active") {
    return buildErrorResponse("API_KEY_REVOKED", 403);
  }

  void touchApiKeyLastUsedAt(record.id);

  return {
    apiKeyId: record.id,
    ownerEmail: record.ownerEmail,
  };
}
