"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyItem } from "@/features/api-key-management/model/api-key-types";
import {
  fetchApiKeys,
  issueApiKey,
  revokeApiKey,
  updateApiKeyLabel,
} from "@/features/api-key-management/api/api-key-api";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return dateFormatter.format(date).toUpperCase();
}

export interface ApiKeyView extends ApiKeyItem {
  createdAtLabel: string;
  lastUsedLabel: string;
}

interface IssueResult {
  apiKey: string;
  record: ApiKeyView;
}

const API_KEYS_QUERY_KEY = ["api-keys"] as const;

function toApiKeyView(item: ApiKeyItem): ApiKeyView {
  return {
    ...item,
    createdAtLabel: formatDate(item.createdAt),
    lastUsedLabel: formatDate(item.lastUsedAt),
  };
}

export function useApiKeys() {
  const queryClient = useQueryClient();
  const apiKeysQuery = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetchApiKeys();
      return response.items.map(toApiKeyView);
    },
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const issueMutation = useMutation({
    mutationFn: issueApiKey,
    onSuccess: (response) => {
      const record = toApiKeyView(response.record);
      queryClient.setQueryData<ApiKeyView[]>(
        API_KEYS_QUERY_KEY,
        (previous) => (previous ? [record, ...previous] : [record]),
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: (response, apiKeyId) => {
      queryClient.setQueryData<ApiKeyView[]>(API_KEYS_QUERY_KEY, (previous) =>
        previous
          ? previous.map((item) =>
              item.id === apiKeyId
                ? {
                    ...item,
                    status: response.record.status,
                    revokedAt: response.record.revokedAt,
                    lastUsedAt: response.record.lastUsedAt,
                    lastUsedLabel: formatDate(response.record.lastUsedAt),
                  }
                : item,
            )
          : previous,
      );
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: ({ apiKeyId, label }: { apiKeyId: string; label: string }) =>
      updateApiKeyLabel(apiKeyId, label),
    onSuccess: (response, variables) => {
      queryClient.setQueryData<ApiKeyView[]>(API_KEYS_QUERY_KEY, (previous) =>
        previous
          ? previous.map((item) =>
              item.id === variables.apiKeyId
                ? { ...item, label: response.record.label }
                : item,
            )
          : previous,
      );
    },
  });

  const issue = useCallback(
    async (label: string): Promise<IssueResult> => {
      const response = await issueMutation.mutateAsync(label);
      return { apiKey: response.apiKey, record: toApiKeyView(response.record) };
    },
    [issueMutation],
  );

  const revoke = useCallback(
    async (apiKeyId: string) => {
      await revokeMutation.mutateAsync(apiKeyId);
    },
    [revokeMutation],
  );

  const updateLabel = useCallback(
    async (apiKeyId: string, label: string) => {
      const response = await updateLabelMutation.mutateAsync({
        apiKeyId,
        label,
      });
      return response.record;
    },
    [updateLabelMutation],
  );

  const items = useMemo(() => apiKeysQuery.data ?? [], [apiKeysQuery.data]);
  const hasItems = items.length > 0;
  const activeCount = useMemo(
    () => items.filter((item) => item.status === "active").length,
    [items],
  );

  return {
    items,
    isLoading: apiKeysQuery.isLoading,
    error:
      apiKeysQuery.error instanceof Error
        ? apiKeysQuery.error.message
        : apiKeysQuery.error
          ? "API_KEY_LIST_FAILED"
          : null,
    isIssuing: issueMutation.isPending,
    isUpdating: updateLabelMutation.isPending,
    isRevoking: revokeMutation.isPending,
    hasItems,
    activeCount,
    refresh: apiKeysQuery.refetch,
    issue,
    revoke,
    updateLabel,
  };
}
