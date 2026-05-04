"use client";

import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { ApiKeyToolbar } from "@/features/api-key-management/ui/api-key-toolbar";
import { useApiKeyManagement } from "@/features/api-key-management/hook/use-api-key-management";
import { AppCard } from "@/shared/ui/app-card";
import { AppButton } from "@/shared/ui/app-button";
import { AppFilterToolbar } from "@/shared/ui/app-filter-toolbar";
import { appToast } from "@/shared/ui/app-toast";
import { useTranslations } from "next-intl";

export function ApiKeyManagementWidget() {
  const { filters, issue, pending, edit, list } = useApiKeyManagement();
  const t = useTranslations("apiKey");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const handleCopyPendingKey = async () => {
    const copied = await pending.copy();
    if (copied) appToast.copied(tCommonActions("copied"));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 overflow-x-hidden px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <AppFilterToolbar>
        <ApiKeyToolbar
          filter={filters.filter}
          onFilterChange={filters.setFilter}
          searchInput={filters.searchInput}
          onSearchInputChange={filters.setSearchInput}
          searchPlaceholder={tCommonLabels("searchPlaceholder")}
          newKeyLabel={issue.newKeyLabel}
          onNewKeyLabelChange={issue.setNewKeyLabel}
          onGenerate={issue.handleIssueKey}
          isIssuing={issue.isIssuing}
        />
      </AppFilterToolbar>

      <div className="w-full">
        {pending.pendingKey ? (
          <AppCard
            variant="plain"
            className="mb-5 rounded-[1.5rem] border-primary/30 bg-primary/8 px-5 py-5 text-sm text-primary shadow-[0_22px_80px_rgba(0,0,0,0.28)]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-primary/80">
                  {t("pending.title")}
                </p>
                <p className="mt-1 text-base font-bold text-white">
                  {pending.pendingKey.label}
                </p>
                <p className="mt-2 break-all rounded-2xl border border-primary/18 bg-black/25 px-4 py-3 font-mono text-xs text-primary/90">
                  {pending.pendingKey.apiKey}
                </p>
              </div>
              <div className="flex gap-2">
                <AppButton
                  type="button"
                  onClick={handleCopyPendingKey}
                  variant="ghost"
                  className="rounded-full border border-primary/35 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/12 hover:text-primary"
                >
                  {pending.pendingCopied
                    ? t("pending.copied")
                    : t("pending.copy")}
                </AppButton>
                <AppButton
                  type="button"
                  onClick={pending.dismiss}
                  variant="ghost"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/6 hover:text-white"
                >
                  {tCommonActions("dismiss")}
                </AppButton>
              </div>
            </div>
            <p className="mt-3 text-xs text-primary/70">
              {t("pending.note")}
            </p>
          </AppCard>
        ) : null}
        {list.error ? (
          <AppCard
            variant="plain"
            className="mb-5 rounded-[1.5rem] border-red-500/20 bg-red-500/8 px-5 py-4 text-sm text-red-200"
          >
            {t("list.error")}
          </AppCard>
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
              ? t("list.loading")
              : filters.searchInput
                ? t("list.search")
                : t("list.default")
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
