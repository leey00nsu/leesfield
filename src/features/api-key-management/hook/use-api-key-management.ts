"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useApiKeys,
  type ApiKeyView,
} from "@/features/api-key-management/hook/use-api-keys";
import { copyTextToClipboard } from "@/shared/lib/clipboard";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

interface PendingKey {
  label: string;
  apiKey: string;
}

interface ApiKeyManagementState {
  pendingKey: PendingKey | null;
  pendingCopied: boolean;
  editingKey: ApiKeyView | null;
  editLabel: string;
  editError: string | null;
}

type ApiKeyManagementAction =
  | { type: "issue:success"; payload: PendingKey }
  | { type: "issue:clear" }
  | { type: "copy:success" }
  | { type: "copy:reset" }
  | { type: "edit:open"; payload: ApiKeyView }
  | { type: "edit:close" }
  | { type: "edit:label"; payload: string }
  | { type: "edit:error"; payload: string | null };

const initialState: ApiKeyManagementState = {
  pendingKey: null,
  pendingCopied: false,
  editingKey: null,
  editLabel: "",
  editError: null,
};

function apiKeyManagementReducer(
  state: ApiKeyManagementState,
  action: ApiKeyManagementAction,
): ApiKeyManagementState {
  switch (action.type) {
    case "issue:success":
      return {
        ...state,
        pendingKey: action.payload,
        pendingCopied: false,
      };
    case "issue:clear":
      return { ...state, pendingKey: null, pendingCopied: false };
    case "copy:success":
      return { ...state, pendingCopied: true };
    case "copy:reset":
      return { ...state, pendingCopied: false };
    case "edit:open":
      return {
        ...state,
        editingKey: action.payload,
        editLabel: action.payload.label,
        editError: null,
      };
    case "edit:close":
      return {
        ...state,
        editingKey: null,
        editLabel: "",
        editError: null,
      };
    case "edit:label":
      return { ...state, editLabel: action.payload };
    case "edit:error":
      return { ...state, editError: action.payload };
    default:
      return state;
  }
}

function buildDefaultLabel() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `API-Key-${yyyy}${mm}${dd}-${hh}${min}`;
}

function useApiKeyManagementState() {
  const [state, dispatch] = useReducer(apiKeyManagementReducer, initialState);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const setPendingKey = (payload: PendingKey) => {
    dispatch({ type: "issue:success", payload });
  };

  const clearPendingKey = () => {
    dispatch({ type: "issue:clear" });
  };

  const markCopied = () => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    dispatch({ type: "copy:success" });
    copyTimerRef.current = window.setTimeout(() => {
      dispatch({ type: "copy:reset" });
    }, 1500);
  };

  const openEdit = (item: ApiKeyView) => {
    dispatch({ type: "edit:open", payload: item });
  };

  const closeEdit = () => {
    dispatch({ type: "edit:close" });
  };

  const setEditLabel = (value: string) => {
    dispatch({ type: "edit:label", payload: value });
  };

  const setEditError = (value: string | null) => {
    dispatch({ type: "edit:error", payload: value });
  };

  return {
    state,
    actions: {
      setPendingKey,
      clearPendingKey,
      markCopied,
      openEdit,
      closeEdit,
      setEditLabel,
      setEditError,
    },
  };
}

function useApiKeyFilters(items: ApiKeyView[]) {
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");

  const filteredKeys = useMemo(() => {
    const normalized = searchInput.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.status !== filter) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const target = `${item.label} ${item.maskedKey}`.toLowerCase();
      return target.includes(normalized);
    });
  }, [filter, items, searchInput]);

  return { searchInput, setSearchInput, filter, setFilter, filteredKeys };
}

export function useApiKeyManagement() {
  const tErrors = useTranslations("apiKey.errors");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const {
    items,
    isLoading,
    error,
    isIssuing,
    isUpdating,
    isRevoking,
    issue,
    revoke,
    updateLabel,
  } = useApiKeys();

  const { state, actions } = useApiKeyManagementState();
  const { searchInput, setSearchInput, filter, setFilter, filteredKeys } =
    useApiKeyFilters(items);

  const handleIssueKey = async () => {
    const label = newKeyLabel.trim() || buildDefaultLabel();
    try {
      const result = await issue(label);
      actions.setPendingKey({
        label: result.record.label,
        apiKey: result.apiKey,
      });
      setNewKeyLabel("");
    } catch (error) {
      console.error("[api-keys] issue failed", error);
    }
  };

  const handleCopyPendingKey = async () => {
    if (!state.pendingKey?.apiKey) return;
    const copied = await copyTextToClipboard(state.pendingKey.apiKey);
    if (copied) actions.markCopied();
    return copied;
  };

  const dismissPendingKey = () => {
    actions.clearPendingKey();
  };

  const handleUpdateLabel = async () => {
    if (!state.editingKey) return;
    const label = state.editLabel.trim();
    if (!label) {
      actions.setEditError(tErrors("labelRequired"));
      return;
    }
    actions.setEditError(null);
    try {
      await updateLabel(state.editingKey.id, label);
      actions.closeEdit();
    } catch (error) {
      console.error("[api-keys] update failed", error);
      actions.setEditError(tErrors("labelUpdateFailed"));
    }
  };

  const handleRevokeFromModal = async () => {
    if (!state.editingKey) return;
    if (state.editingKey.status === "revoked") return;
    try {
      await revoke(state.editingKey.id);
      actions.closeEdit();
    } catch (error) {
      console.error("[api-keys] revoke failed", error);
      actions.setEditError(tErrors("revokeFailed"));
    }
  };

  return {
    filters: {
      searchInput,
      setSearchInput,
      filter,
      setFilter,
    },
    issue: {
      newKeyLabel,
      setNewKeyLabel,
      handleIssueKey,
      isIssuing,
    },
    pending: {
      pendingKey: state.pendingKey,
      pendingCopied: state.pendingCopied,
      copy: handleCopyPendingKey,
      dismiss: dismissPendingKey,
    },
    edit: {
      editingKey: state.editingKey,
      editLabel: state.editLabel,
      setEditLabel: actions.setEditLabel,
      error: state.editError,
      update: handleUpdateLabel,
      revoke: handleRevokeFromModal,
      open: actions.openEdit,
      close: actions.closeEdit,
      isUpdating,
      isRevoking,
    },
    list: {
      filteredKeys,
      isLoading,
      error,
    },
  };
}

export type { ApiKeyStatusFilter, ApiKeyView };
