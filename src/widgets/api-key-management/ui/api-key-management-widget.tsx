"use client";

import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { ApiKeyToolbar } from "@/features/api-key-management/ui/api-key-toolbar";
import { useApiKeyManagement } from "@/features/api-key-management/model/use-api-key-management";
import {
  DashboardPageHeader,
  DashboardSearchInput,
} from "@/shared/ui/dashboard-page-header";
import { Button } from "@/shared/ui/button";

export function ApiKeyManagementWidget() {
  const {
    searchInput,
    setSearchInput,
    filter,
    setFilter,
    newKeyLabel,
    setNewKeyLabel,
    isIssuing,
    pendingKey,
    pendingCopied,
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
  } = useApiKeyManagement();

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <DashboardPageHeader
        title={
          <>
            <span className="text-white">API Key</span>{" "}
            <span className="text-primary">Management</span>
          </>
        }
        subtitle="SECURE YOUR API ACCESS"
        rightSlot={
          <DashboardSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="SEARCH_KEYS..."
            filterButtonLabel="필터 옵션"
          />
        }
      >
        <ApiKeyToolbar
          filter={filter}
          onFilterChange={setFilter}
          newKeyLabel={newKeyLabel}
          onNewKeyLabelChange={setNewKeyLabel}
          onGenerate={handleIssueKey}
          isIssuing={isIssuing}
        />
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
                <Button
                  type="button"
                  onClick={handleCopyPendingKey}
                  variant="ghost"
                  className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                >
                  {pendingCopied ? "Copied" : "Copy Key"}
                </Button>
                <Button
                  type="button"
                  onClick={dismissPendingKey}
                  variant="ghost"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
                >
                  Dismiss
                </Button>
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
            onEdit: () => openEdit(item),
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

      <ApiKeyEditModal
        open={Boolean(editingKey)}
        apiKey={editingKey}
        label={editLabel}
        error={editError}
        isSaving={isUpdating}
        isRevoking={isRevoking}
        onLabelChange={setEditLabel}
        onClose={closeEdit}
        onSave={handleUpdateLabel}
        onRevoke={handleRevokeFromModal}
      />
    </div>
  );
}
