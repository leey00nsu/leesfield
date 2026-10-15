"use client";
import { logger } from "@/shared/logging/logger.mjs";

import { useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useApiKeys,
  type ApiKeyView,
} from "@/features/api-key-management/hook/use-api-keys";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import { standardApiKeyPermissions, type PlatformPermission } from "@/shared/api/platform-permissions";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

interface PendingKey {
  label: string;
  apiKey: string;
}

interface ApiKeyManagementState {
  pendingKey: PendingKey | null;
  editingKey: ApiKeyView | null;
  editLabel: string;
  editPermissions: PlatformPermission[];
  editError: string | null;
}

type ApiKeyManagementAction =
  | { type: "issue:success"; payload: PendingKey }
  | { type: "issue:clear" }
  | { type: "edit:open"; payload: ApiKeyView }
  | { type: "edit:close" }
  | { type: "edit:label"; payload: string }
  | { type: "edit:permissions"; payload: PlatformPermission[] }
  | { type: "edit:error"; payload: string | null };

const initialState: ApiKeyManagementState = {
  pendingKey: null,
  editingKey: null,
  editLabel: "",
  editPermissions: [],
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
      };
    case "issue:clear":
      return { ...state, pendingKey: null };
    case "edit:open":
      return {
        ...state,
        editingKey: action.payload,
        editLabel: action.payload.label,
        editPermissions: action.payload.permissions ?? [],
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
    case "edit:permissions":
      return { ...state, editPermissions: action.payload };
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
  const setPendingKey = (payload: PendingKey) => {
    dispatch({ type: "issue:success", payload });
  };

  const clearPendingKey = () => {
    dispatch({ type: "issue:clear" });
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
      openEdit,
      closeEdit,
      setEditLabel,
      setEditPermissions: (payload: PlatformPermission[]) => dispatch({ type: "edit:permissions", payload }),
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
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const copy = useClipboardCopy();
  const issueInFlight = useRef(false);
  const issueCycle = useRef(0);
  const [newKeyPermissions, setNewKeyPermissions] = useState<PlatformPermission[]>([...standardApiKeyPermissions]);
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
    if (!issueOpen || issueInFlight.current || state.pendingKey) return;
    issueInFlight.current = true;
    const label = newKeyLabel.trim() || buildDefaultLabel();
    setIssueError(null);
    try {
      const result = await issue(label, newKeyPermissions);
      actions.setPendingKey({
        label: result.record.label,
        apiKey: result.apiKey,
      });
      setNewKeyLabel("");
      setNewKeyPermissions([...standardApiKeyPermissions]);
    } catch (error) {
      setIssueError(tErrors("issueFailed"));
      logger.error("api-keys.issue.failed", error);
    } finally {
      issueInFlight.current = false;
    }
  };

  const handleCopyPendingKey = async () => {
    if (!state.pendingKey?.apiKey) return;
    const cycle = issueCycle.current;
    return copy(state.pendingKey.apiKey, {
      isCurrent: () => cycle === issueCycle.current,
      errorMessage: tErrors("copyFailed"),
    });
  };

  const dismissPendingKey = () => {
    if (issueInFlight.current) return;
    issueCycle.current += 1;
    actions.clearPendingKey();
    setIssueOpen(false);
    setIssueError(null);
    setNewKeyLabel("");
    setNewKeyPermissions([...standardApiKeyPermissions]);
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
      await updateLabel(state.editingKey.id, label, state.editPermissions);
      actions.closeEdit();
    } catch (error) {
      logger.error("api-keys.update.failed", error);
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
      logger.error("api-keys.revoke.failed", error);
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
      isOpen: issueOpen,
      open: () => { dismissPendingKey(); setIssueOpen(true); },
      close: dismissPendingKey,
      newKeyLabel,
      setNewKeyLabel,
      newKeyPermissions,
      setNewKeyPermissions,
      handleIssueKey,
      isIssuing,
      error: issueError,
    },
    pending: {
      pendingKey: state.pendingKey,
      copy: handleCopyPendingKey,
      dismiss: dismissPendingKey,
    },
    edit: {
      editingKey: state.editingKey,
      editLabel: state.editLabel,
      editPermissions: state.editPermissions,
      setEditPermissions: actions.setEditPermissions,
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
