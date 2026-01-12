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
  const rawKey = request.headers.get("x-api-key") ?? request.headers.get("X-API-Key");
  const apiKey = rawKey?.trim() ?? "";

  if (!apiKey) {
    return NextResponse.json(
      { message: "API_KEY_REQUIRED" },
      { status: 401 },
    );
  }

  const keyHash = hashApiKey(apiKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!record) {
    return NextResponse.json(
      { message: "INVALID_API_KEY" },
      { status: 403 },
    );
  }

  if (record.status !== "active") {
    return NextResponse.json(
      { message: "API_KEY_REVOKED" },
      { status: 403 },
    );
  }

  await prisma.apiKey
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
