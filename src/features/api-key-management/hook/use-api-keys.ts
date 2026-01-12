"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type ApiKeyView = ApiKeyItem & {
  createdAtLabel: string;
  lastUsedLabel: string;
};

type ApiKeyState = {
  items: ApiKeyView[];
  isLoading: boolean;
  error: string | null;
};

type IssueResult = {
  apiKey: string;
  record: ApiKeyView;
};

export function useApiKeys() {
  const [state, setState] = useState<ApiKeyState>({
    items: [],
    isLoading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetchApiKeys();
      const items = response.items.map((item) => ({
        ...item,
        createdAtLabel: formatDate(item.createdAt),
        lastUsedLabel: formatDate(item.lastUsedAt),
      }));
      setState({ items, isLoading: false, error: null });
    } catch (error) {
      setState({
        items: [],
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "API_KEY_LIST_FAILED",
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const issue = useCallback(async (label: string): Promise<IssueResult> => {
    const response = await issueApiKey(label);
    const record = {
      ...response.record,
      createdAtLabel: formatDate(response.record.createdAt),
      lastUsedLabel: formatDate(response.record.lastUsedAt),
    };
    setState((prev) => ({
      ...prev,
      items: [record, ...prev.items],
    }));
    return { apiKey: response.apiKey, record };
  }, []);

  const revoke = useCallback(async (apiKeyId: string) => {
    const response = await revokeApiKey(apiKeyId);
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === apiKeyId
          ? {
              ...item,
              status: response.record.status,
              revokedAt: response.record.revokedAt,
              lastUsedAt: response.record.lastUsedAt,
              lastUsedLabel: formatDate(response.record.lastUsedAt),
            }
          : item,
      ),
    }));
  }, []);

  const updateLabel = useCallback(
    async (apiKeyId: string, label: string) => {
      const response = await updateApiKeyLabel(apiKeyId, label);
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === apiKeyId
            ? {
                ...item,
                label: response.record.label,
              }
            : item,
        ),
      }));
      return response.record;
    },
    [],
  );

  const hasItems = state.items.length > 0;
  const activeCount = useMemo(
    () => state.items.filter((item) => item.status === "active").length,
    [state.items],
  );

  return {
    ...state,
    hasItems,
    activeCount,
    refresh: load,
    issue,
    revoke,
    updateLabel,
  };
}
