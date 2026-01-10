import crypto from "crypto";
import { prisma } from "@/server/db/prisma";

export const API_KEY_PREFIX = "lf_live_";

export type ApiKeyStatus = "active" | "revoked";

export type ApiKeyRecord = {
  id: string;
  ownerEmail: string;
  label: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export type IssueApiKeyResult = {
  apiKey: string;
  record: ApiKeyRecord;
};

export function generateApiKey(): {
  apiKey: string;
  maskedKey: string;
  keyHash: string;
} {
  const token = crypto.randomBytes(24).toString("base64url");
  const apiKey = `${API_KEY_PREFIX}${token}`;
  return {
    apiKey,
    maskedKey: maskApiKey(apiKey),
    keyHash: hashApiKey(apiKey),
  };
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
  }
  const payload = apiKey.slice(API_KEY_PREFIX.length);
  const head = payload.slice(0, 4);
  const tail = payload.slice(-4);
  return `${API_KEY_PREFIX}${head}...${tail}`;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function mapRecord(record: {
  id: string;
  ownerEmail: string;
  label: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}): ApiKeyRecord {
  return {
    id: record.id,
    ownerEmail: record.ownerEmail,
    label: record.label,
    maskedKey: record.maskedKey,
    status: record.status,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  };
}

export async function issueApiKey(params: {
  label: string;
  ownerEmail: string;
}): Promise<IssueApiKeyResult> {
  const { apiKey, maskedKey, keyHash } = generateApiKey();

  const record = await prisma.apiKey.create({
    data: {
      ownerEmail: params.ownerEmail,
      label: params.label,
      keyHash,
      maskedKey,
      status: "active",
    },
  });

  return {
    apiKey,
    record: mapRecord(record),
  };
}

export async function listApiKeys(ownerEmail: string): Promise<ApiKeyRecord[]> {
  const records = await prisma.apiKey.findMany({
    where: { ownerEmail },
    orderBy: { createdAt: "desc" },
  });
  return records.map(mapRecord);
}

export async function revokeApiKey(params: {
  id: string;
  ownerEmail: string;
}): Promise<ApiKeyRecord> {
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: params.id,
      ownerEmail: params.ownerEmail,
    },
  });

  if (!existing) {
    throw new Error("API_KEY_NOT_FOUND");
  }

  if (existing.status === "revoked") {
    return mapRecord(existing);
  }

  const updated = await prisma.apiKey.update({
    where: { id: existing.id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
    },
  });

  return mapRecord(updated);
}
