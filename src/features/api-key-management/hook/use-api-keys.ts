"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { ApiKeyItem } from "@/features/api-key-management/model/api-key-types";
import {
  fetchApiKeys,
  issueApiKey,
  revokeApiKey,
  updateApiKeyLabel,
} from "@/features/api-key-management/api/api-key-api";

export interface ApiKeyView extends ApiKeyItem {
  createdAtLabel: string;
  lastUsedLabel: string;
}

interface IssueResult {
  apiKey: string;
  record: ApiKeyView;
}

const API_KEYS_QUERY_KEY = ["api-keys"] as const;

export function useApiKeys() {
  const locale = useLocale();
  const tCard = useTranslations("apiKey.card");
  const tCommonLabels = useTranslations("common.labels");
  const queryClient = useQueryClient();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
    [locale],
  );
  const formatDate = useCallback(
    (value: string | null) => {
      if (!value) return tCard("usage.never");
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return tCommonLabels("unknown");
      return dateFormatter.format(date);
    },
    [dateFormatter, tCard, tCommonLabels],
  );
  const toApiKeyView = useCallback(
    (item: ApiKeyItem): ApiKeyView => ({
      ...item,
      createdAtLabel: formatDate(item.createdAt),
      lastUsedLabel: formatDate(item.lastUsedAt),
    }),
    [formatDate],
  );
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
    [issueMutation, toApiKeyView],
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
