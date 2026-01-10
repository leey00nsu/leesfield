"use client";

import { useMemo, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import { useApiKeys } from "@/features/api-key-management/hook/use-api-keys";
import type { ApiKeyItem } from "@/features/api-key-management/model/api-key-types";
import {
  DashboardPageHeader,
  DashboardSearchInput,
} from "@/shared/ui/dashboard-page-header";
import {
  DashboardFilterBar,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { cn } from "@/shared/lib/utils";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

type ApiKeyView = ApiKeyItem & {
  createdAtLabel: string;
  lastUsedLabel: string;
};

type PendingKey = {
  label: string;
  apiKey: string;
};

export function ApiKeyManagementScreen() {
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  const [pendingKey, setPendingKey] = useState<PendingKey | null>(null);
  const { items, isLoading, error, issue, revoke } = useApiKeys();

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
    const label = newKeyLabel.trim();
    if (!label) return;
    setIsIssuing(true);
    try {
      const result = await issue(label);
      setPendingKey({ label: result.record.label, apiKey: result.apiKey });
      setNewKeyLabel("");
    } catch (error) {
      console.error("[api-keys] issue failed", error);
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCopy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const handleRevoke = async (item: ApiKeyView) => {
    if (item.status === "revoked") return;
    try {
      await revoke(item.id);
    } catch (error) {
      console.error("[api-keys] revoke failed", error);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <DashboardPageHeader
        title={
          <>
            <span className="text-white">API Key</span>{" "}
            <span className="text-primary">Management</span>
          </>
        }
        subtitle="SECURE ACCESS CONTROL // ACTIVE SESSION"
        rightSlot={
          <DashboardSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="SEARCH_KEYS..."
            filterButtonLabel="필터 옵션"
          />
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DashboardFilterBar className="gap-2">
            <DashboardFilterToggle
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              active={filter === "all"}
              icon={<KeyRound className="h-4 w-4" />}
            >
              All Keys
            </DashboardFilterToggle>
            <DashboardFilterToggle
              onClick={() => setFilter("active")}
              aria-pressed={filter === "active"}
              active={filter === "active"}
              icon={<ShieldCheck className="h-4 w-4" />}
            >
              Active
            </DashboardFilterToggle>
            <DashboardFilterToggle
              onClick={() => setFilter("revoked")}
              aria-pressed={filter === "revoked"}
              active={filter === "revoked"}
              icon={<Slash className="h-4 w-4" />}
            >
              Revoked
            </DashboardFilterToggle>
          </DashboardFilterBar>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newKeyLabel}
              onChange={(event) => setNewKeyLabel(event.target.value)}
              placeholder="NEW_KEY_LABEL..."
              className="h-10 w-full min-w-[220px] rounded-full border border-white/10 bg-surface-dark px-4 text-xs font-mono uppercase tracking-wider text-white placeholder:text-gray-600 focus:border-primary focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={handleIssueKey}
              disabled={isIssuing || newKeyLabel.trim().length === 0}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-wider text-black",
                "transition-colors hover:bg-white shadow-[0_0_20px_rgba(212,240,50,0.2)]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary",
              )}
            >
              <Plus className="h-5 w-5" />
              {isIssuing ? "Generating..." : "Generate New Key"}
            </button>
          </div>
        </div>
      </DashboardPageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        {pendingKey ? (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/10 px-6 py-5 text-sm text-primary">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-primary/80">
                  NEW API KEY GENERATED
                </p>
                <p className="mt-1 text-base font-bold text-white">
                  {pendingKey.label}
                </p>
                <p className="mt-2 font-mono text-xs text-primary/90">
                  {pendingKey.apiKey}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(pendingKey.apiKey)}
                  className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                >
                  Copy Key
                </button>
                <button
                  type="button"
                  onClick={() => setPendingKey(null)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-primary/70">
              API 키는 이번 화면에서만 전체 값을 확인할 수 있습니다.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        <ApiKeyList
          items={filteredKeys.map((item) => ({
            id: item.id,
            name: item.label,
            maskedKey: item.maskedKey,
            status: item.status,
            lastUsedLabel: item.lastUsedLabel,
            createdAtLabel: item.createdAtLabel,
            onCopy: () => handleCopy(item.maskedKey),
            onRevoke: () => handleRevoke(item),
          }))}
          emptyMessage={
            isLoading
              ? "API 키를 불러오는 중입니다."
              : searchInput
                ? "검색 결과가 없습니다."
                : "API 키가 없습니다."
          }
        />
      </div>
    </div>
  );
}
