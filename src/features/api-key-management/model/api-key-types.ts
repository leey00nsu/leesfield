export type ApiKeyStatus = "active" | "revoked";

export type ApiKeyItem = {
  id: string;
  label: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
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
