import type {
  ApiKeyListResponse,
  IssueApiKeyResponse,
  RevokeApiKeyResponse,
} from "@/features/api-key-management/model/api-key-types";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "API_REQUEST_FAILED");
  }
  return response.json() as Promise<T>;
}

export async function fetchApiKeys(): Promise<ApiKeyListResponse> {
  const response = await fetch("/api/api-keys", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  return handleResponse<ApiKeyListResponse>(response);
}

export async function issueApiKey(label: string): Promise<IssueApiKeyResponse> {
  const response = await fetch("/api/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ label }),
  });
  return handleResponse<IssueApiKeyResponse>(response);
}

export async function revokeApiKey(
  apiKeyId: string,
): Promise<RevokeApiKeyResponse> {
  const response = await fetch(`/api/api-keys/${apiKeyId}/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return handleResponse<RevokeApiKeyResponse>(response);
}
