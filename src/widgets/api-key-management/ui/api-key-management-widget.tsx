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
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{t("title.leading")}</span>{" "}
            <span className="text-primary">{t("title.accent")}</span>
          </>
        }
        subtitle={t("subtitle")}
        rightSlot={
          <PageHeaderSearchInput
            value={filters.searchInput}
            onChange={filters.setSearchInput}
            placeholder={tCommonLabels("searchPlaceholder")}
            filterButtonLabel={tCommonLabels("filterOptions")}
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
                  {t("pending.title")}
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
                  onClick={handleCopyPendingKey}
                  variant="ghost"
                  className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                >
                  {pending.pendingCopied
                    ? t("pending.copied")
                    : t("pending.copy")}
                </Button>
                <Button
                  type="button"
                  onClick={pending.dismiss}
                  variant="ghost"
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
                >
                  {tCommonActions("dismiss")}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-primary/70">
              {t("pending.note")}
            </p>
          </div>
        ) : null}
        {list.error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {t("list.error")}
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
