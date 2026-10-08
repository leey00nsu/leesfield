import type { PlatformPermission } from "@/shared/api/platform-permissions";
export type ApiKeyStatus = "active" | "revoked";

export type ApiKeyItem = {
  id: string;
  label: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  permissions?: PlatformPermission[];
};

export type ApiKeyListResponse = {
  items: ApiKeyItem[];
};

export type IssueApiKeyResponse = {
  apiKey: string;
  record: ApiKeyItem;
};

export type RevokeApiKeyResponse = {
  record: ApiKeyItem;
};

export type UpdateApiKeyResponse = {
  record: ApiKeyItem;
};
