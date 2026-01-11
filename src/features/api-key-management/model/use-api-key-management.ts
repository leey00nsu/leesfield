"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiKeyItem } from "@/features/api-key-management/model/api-key-types";
import { useApiKeys } from "@/features/api-key-management/hook/use-api-keys";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

type ApiKeyView = ApiKeyItem & {
  createdAtLabel: string;
  lastUsedLabel: string;
};

type PendingKey = {
  label: string;
  apiKey: string;
};

function buildDefaultLabel() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `API-Key-${yyyy}${mm}${dd}-${hh}${min}`;
}

export function useApiKeyManagement() {
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  const [pendingKey, setPendingKey] = useState<PendingKey | null>(null);
  const [pendingCopied, setPendingCopied] = useState(false);
  const [issueError, setIssueError] = useState<Error | null>(null);
  const [editingKey, setEditingKey] = useState<ApiKeyView | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const { items, isLoading, error, issue, revoke, updateLabel } = useApiKeys();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

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

  const handleIssueKey = async () => {
    const label = newKeyLabel.trim() || buildDefaultLabel();
    setIsIssuing(true);
    setIssueError(null);
    try {
      const result = await issue(label);
      setPendingKey({ label: result.record.label, apiKey: result.apiKey });
      setPendingCopied(false);
      setNewKeyLabel("");
      setIssueError(null);
    } catch (error) {
      console.error("[api-keys] issue failed", error);
      setIssueError(
        error instanceof Error ? error : new Error("API_KEY_ISSUE_FAILED"),
      );
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCopyPendingKey = async () => {
    if (!pendingKey?.apiKey) return;
    try {
      await navigator.clipboard.writeText(pendingKey.apiKey);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = pendingKey.apiKey;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    setPendingCopied(true);
    copyTimerRef.current = window.setTimeout(() => {
      setPendingCopied(false);
    }, 1500);
  };

  const dismissPendingKey = () => {
    setPendingKey(null);
    setPendingCopied(false);
  };

  const openEdit = (item: ApiKeyView) => {
    setEditingKey(item);
    setEditLabel(item.label);
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingKey(null);
    setEditLabel("");
    setEditError(null);
  };

  const handleUpdateLabel = async () => {
    if (!editingKey) return;
    const label = editLabel.trim();
    if (!label) {
      setEditError("라벨을 입력해주세요.");
      return;
    }
    setIsUpdating(true);
    setEditError(null);
    try {
      await updateLabel(editingKey.id, label);
      closeEdit();
    } catch (error) {
      console.error("[api-keys] update failed", error);
      setEditError("라벨 업데이트에 실패했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRevokeFromModal = async () => {
    if (!editingKey) return;
    if (editingKey.status === "revoked") return;
    setIsRevoking(true);
    try {
      await revoke(editingKey.id);
      closeEdit();
    } catch (error) {
      console.error("[api-keys] revoke failed", error);
      setEditError("키 폐기에 실패했습니다.");
    } finally {
      setIsRevoking(false);
    }
  };

  return {
    searchInput,
    setSearchInput,
    filter,
    setFilter,
    newKeyLabel,
    setNewKeyLabel,
    isIssuing,
    pendingKey,
    pendingCopied,
    issueError,
    handleIssueKey,
    handleCopyPendingKey,
    dismissPendingKey,
    filteredKeys,
    isLoading,
    error,
    editingKey,
    editLabel,
    setEditLabel,
    editError,
    isUpdating,
    isRevoking,
    openEdit,
    closeEdit,
    handleUpdateLabel,
    handleRevokeFromModal,
  };
}

export type { ApiKeyStatusFilter, ApiKeyView };
