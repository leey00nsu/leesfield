import { apiKeyHeader } from "@/shared/api/external-contract";
import { buildErrorResponse } from "@/server/http/response";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";

export type ApiKeyAuthContext = {
  apiKeyId: string;
  ownerEmail: string;
};

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

  void prisma.apiKey
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => null);

  return {
    apiKeyId: record.id,
    ownerEmail: record.ownerEmail,
  };
}
