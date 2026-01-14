"use client";

import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { ApiKeyToolbar } from "@/features/api-key-management/ui/api-key-toolbar";
import { useApiKeyManagement } from "@/features/api-key-management/hook/use-api-key-management";
import {
  PageHeader,
  PageHeaderSearchInput,
} from "@/shared/ui/page-header";
import { Button } from "@/shared/ui/button";

export function ApiKeyManagementWidget() {
  const { filters, issue, pending, edit, list } = useApiKeyManagement();

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">API Key</span>{" "}
            <span className="text-primary">Management</span>
          </>
        }
        subtitle="SECURE YOUR API ACCESS"
        rightSlot={
          <PageHeaderSearchInput
            value={filters.searchInput}
            onChange={filters.setSearchInput}
            placeholder="SEARCH_KEYS..."
            filterButtonLabel="필터 옵션"
          />
        }
      >
        <ApiKeyToolbar
          filter={filters.filter}
          onFilterChange={filters.setFilter}
          newKeyLabel={issue.newKeyLabel}
          onNewKeyLabelChange={issue.setNewKeyLabel}
          onGenerate={issue.handleIssueKey}
          isIssuing={issue.isIssuing}
        />
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        {pending.pendingKey ? (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/10 px-6 py-5 text-sm text-primary">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-primary/80">
                  NEW API KEY GENERATED
                </p>
                <p className="mt-1 text-base font-bold text-white">
                  {pending.pendingKey.label}
                </p>
                <p className="mt-2 font-mono text-xs text-primary/90">
                  {pending.pendingKey.apiKey}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={pending.copy}
                  variant="ghost"
                  className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                >
                  {pending.pendingCopied ? "Copied" : "Copy Key"}
                </Button>
                <Button
                  type="button"
                  onClick={pending.dismiss}
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
        {list.error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {list.error}
          </div>
        ) : null}
        <ApiKeyList
          items={list.filteredKeys.map((item) => ({
            id: item.id,
            name: item.label,
            maskedKey: item.maskedKey,
            status: item.status,
            lastUsedLabel: item.lastUsedLabel,
            createdAtLabel: item.createdAtLabel,
            onEdit: () => edit.open(item),
          }))}
          emptyMessage={
            list.isLoading
              ? "API 키를 불러오는 중입니다."
              : filters.searchInput
                ? "검색 결과가 없습니다."
                : "API 키가 없습니다."
          }
        />
      </div>

      <ApiKeyEditModal
        open={Boolean(edit.editingKey)}
        apiKey={edit.editingKey}
        label={edit.editLabel}
        error={edit.error}
        isSaving={edit.isUpdating}
        isRevoking={edit.isRevoking}
        onLabelChange={edit.setEditLabel}
        onClose={edit.close}
        onSave={edit.update}
        onRevoke={edit.revoke}
      />
    </div>
  );
}
