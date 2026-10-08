"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ResourceListLoading } from "@/shared/ui/resource-list-loading";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { AppCard } from "@/shared/ui/app-card";
import { AppFilterToolbar } from "@/shared/ui/app-filter-toolbar";
import { appToast } from "@/shared/ui/app-toast";
import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { ApiKeyIssueModal } from "@/features/api-key-management/ui/api-key-issue-modal";
import { ApiKeyToolbar } from "@/features/api-key-management/ui/api-key-toolbar";
import { useApiKeyManagement } from "@/features/api-key-management/hook/use-api-key-management";

export function ApiKeyManagementWidget() {
  const { filters, issue, pending, edit, list } = useApiKeyManagement();
  const issueButtonRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("apiKey");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const handleCopyPendingKey = async () => {
    const copied = await pending.copy();
    if (copied) appToast.copied(tCommonActions("copied"));
  };
  return (
    <AppPageShell>
      <h1 className="sr-only">{t("title.leading") + " " + t("title.accent")}</h1>
      <AppFilterToolbar>
        <ApiKeyToolbar filter={filters.filter} onFilterChange={filters.setFilter}
          searchInput={filters.searchInput} onSearchInputChange={filters.setSearchInput}
          searchPlaceholder={tCommonLabels("searchPlaceholder")} onGenerate={issue.open} generateButtonRef={issueButtonRef} />
      </AppFilterToolbar>
      <div className="w-full">
        {list.error ? <AppCard variant="plain" className="mb-5 px-5 py-4 text-sm text-destructive">{t("list.error")}</AppCard> : null}
        {list.isLoading ? <ResourceListLoading label={t("list.loading")} /> : <ApiKeyList
          items={list.filteredKeys.map((item) => ({
            id: item.id, name: item.label, maskedKey: item.maskedKey, status: item.status,
            lastUsedLabel: item.lastUsedLabel, createdAtLabel: item.createdAtLabel, onEdit: () => edit.open(item),
          }))}
          emptyMessage={filters.searchInput ? t("list.search") : t("list.default")} />}
      </div>
      <ApiKeyIssueModal open={issue.isOpen} finalFocus={issueButtonRef} label={issue.newKeyLabel} onLabelChange={issue.setNewKeyLabel}
        permissions={issue.newKeyPermissions} onPermissionsChange={issue.setNewKeyPermissions}
        error={issue.error} isIssuing={issue.isIssuing} onGenerate={issue.handleIssueKey} onClose={issue.close}
        pendingKey={pending.pendingKey} copied={pending.pendingCopied} copyError={pending.error} onCopy={handleCopyPendingKey} />
      <ApiKeyEditModal open={Boolean(edit.editingKey)} apiKey={edit.editingKey} label={edit.editLabel}
        error={edit.error} isSaving={edit.isUpdating} isRevoking={edit.isRevoking} onLabelChange={edit.setEditLabel}
        onClose={edit.close} onSave={edit.update} onRevoke={edit.revoke}
        permissions={edit.editPermissions} onPermissionsChange={edit.setEditPermissions} />
    </AppPageShell>
  );
}
