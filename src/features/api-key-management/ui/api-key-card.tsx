import { CheckCircle2, KeyRound, Pencil, Slash, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { useTranslations } from "next-intl";

import type { ApiKeyStatus } from "@/features/api-key-management/model/api-key-types";

type ApiKeyCardProps = {
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedLabel: string;
  createdAtLabel: string;
  onEdit?: () => void;
};

const statusConfig = {
  active: {
    icon: CheckCircle2,
    dot: "bg-green-500",
    text: "text-green-400",
  },
  revoked: {
    icon: XCircle,
    dot: "bg-red-500",
    text: "text-red-400",
  },
};

export function ApiKeyCard({
  name,
  maskedKey,
  status,
  lastUsedLabel,
  createdAtLabel,
  onEdit,
}: ApiKeyCardProps) {
  const t = useTranslations("apiKey.card");
  const tCommonActions = useTranslations("common.actions");
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const canEdit = Boolean(onEdit);
  const usageHint =
    lastUsedLabel === t("usage.never")
      ? t("usage.never")
      : t("usage.lastUsed", { value: lastUsedLabel });

  return (
    <AppCard
      variant="plain"
      className={cn(
        "group rounded-[1.5rem] border-white/10 bg-[rgba(11,13,14,0.74)] px-5 py-5 shadow-[0_22px_80px_rgba(0,0,0,0.22)] transition-colors hover:border-primary/45",
        status === "revoked" && "opacity-70 hover:border-white/18",
      )}
    >
      <article className="grid gap-5 md:grid-cols-[minmax(0,1.45fr)_minmax(7rem,0.4fr)_minmax(7rem,0.4fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-white/68">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="min-w-0 truncate text-lg font-semibold text-white">
                {name}
              </h3>
              <AppBadge
                variant="muted"
                className={cn(
                  "gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs font-semibold",
                  config.text,
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {t(`status.${status}`)}
              </AppBadge>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded-xl border border-white/10 bg-black/32 px-3 py-1.5 font-mono text-xs text-white/52">
                {maskedKey}
              </code>
              <span className="text-xs text-white/36">{usageHint}</span>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/34">
            {t("lastUsedLabel")}
          </span>
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/74">
            <span className={cn("h-2 w-2 rounded-full", config.dot)} />
            <span className="truncate">{lastUsedLabel}</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/34">
            {t("createdLabel")}
          </span>
          <span className="truncate text-sm font-medium text-white/62">
            {createdAtLabel}
          </span>
        </div>
        <div className="flex items-center md:justify-end">
          {status === "active" ? (
            <AppButton
              type="button"
              onClick={onEdit}
              disabled={!canEdit}
              aria-disabled={!canEdit}
              title={canEdit ? tCommonActions("edit") : tCommonActions("comingSoon")}
              variant="surface"
              size="pill-md"
              className={cn(
                "font-semibold",
                !canEdit &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              <Pencil className="h-4 w-4" />
              {tCommonActions("edit")}
            </AppButton>
          ) : (
            <AppButton
              type="button"
              onClick={onEdit}
              disabled={!canEdit}
              aria-disabled={!canEdit}
              title={canEdit ? tCommonActions("edit") : tCommonActions("comingSoon")}
              variant="surface-muted"
              size="pill-md"
              className="font-semibold"
            >
              <Slash className="h-4 w-4" />
              {tCommonActions("edit")}
            </AppButton>
          )}
        </div>
      </article>
    </AppCard>
  );
}
