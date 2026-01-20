import { CheckCircle2, Shield, Slash, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
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
    <article className="group relative flex flex-col gap-6 rounded-xl border border-white/5 bg-surface-dark p-6 shadow-lg transition-all hover:border-primary/50 md:flex-row md:items-center md:justify-between">
      <div className="flex w-full items-start gap-5 md:w-auto md:items-center">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-surface-lighter text-primary">
          {status === "active" ? (
            <Shield className="h-7 w-7" />
          ) : (
            <Slash className="h-7 w-7 text-red-400" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-bold tracking-tight text-white">
              {name}
            </h3>
            <Badge
              variant="muted"
              className={cn("gap-1 bg-white/5", config.text)}
            >
              <StatusIcon className="h-3 w-3" />
              {t(`status.${status}`)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border border-white/5 bg-black/50 px-2 py-1 text-xs font-mono text-gray-400">
              {maskedKey}
            </code>
            <span className="text-xs font-mono text-gray-600">• {usageHint}</span>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-6 border-t border-white/5 pt-4 md:w-auto md:flex-row md:items-center md:gap-10 md:border-t-0 md:pt-0">
        <div className="flex min-w-[100px] flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("lastUsedLabel")}
          </span>
          <span className="flex items-center gap-2 text-sm font-mono text-gray-200">
            <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
            {lastUsedLabel}
          </span>
        </div>
        <div className="flex min-w-[100px] flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("createdLabel")}
          </span>
          <span className="text-sm font-mono text-gray-400">
            {createdAtLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <Button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            aria-disabled={!canEdit}
            title={canEdit ? tCommonActions("edit") : tCommonActions("comingSoon")}
            variant="ghost"
            className={cn(
              "rounded-lg border border-transparent px-4 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white",
              !canEdit &&
                "cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent hover:text-gray-400",
            )}
          >
            {tCommonActions("edit")}
          </Button>
        </div>
      </div>
    </article>
  );
}
