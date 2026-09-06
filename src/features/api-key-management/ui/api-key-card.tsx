import { Circle, KeyRound, MoreVertical } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ResourceRowButton, resourceRowInteractiveClassName } from "@/shared/ui/brand/resource-row-link/resource-row-link";
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

export function ApiKeyCard({ name, maskedKey, status, lastUsedLabel, createdAtLabel, onEdit }: ApiKeyCardProps) {
  const t = useTranslations("apiKey.card");
  return (
    <article className={cn("grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-5 lg:grid-cols-[2.5rem_minmax(0,1fr)_9rem_9rem_6rem_2rem]", onEdit && resourceRowInteractiveClassName)}>
      <div className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.035]">
        <KeyRound className="size-6 text-white/66" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-foreground">
          {onEdit ? <ResourceRowButton onClick={onEdit} className="text-left">{name}</ResourceRowButton> : name}
        </h3>
        <code className="mt-2 block truncate font-mono text-xs text-muted-foreground">{maskedKey}</code>
      </div>
      <div className="col-start-2 min-w-0 text-xs lg:col-auto">
        <p className="text-muted-foreground">{t("lastUsedLabel")}</p>
        <p className="mt-2 truncate text-foreground">{lastUsedLabel}</p>
      </div>
      <div className="col-start-2 min-w-0 text-xs lg:col-auto">
        <p className="text-muted-foreground">{t("createdLabel")}</p>
        <p className="mt-2 truncate text-foreground">{createdAtLabel}</p>
      </div>
      <div className="col-start-2 flex items-center gap-2 lg:col-auto">
        <Circle className={cn("size-3 fill-current", status === "active" ? "text-success-foreground" : "text-muted-foreground")} />
        <span className="text-xs font-medium text-muted-foreground">{t(`status.${status}`)}</span>
      </div>
      <div className="col-start-3 row-start-1 flex justify-end lg:col-auto lg:row-auto">
        {onEdit ? <MoreVertical className="size-4 text-muted-foreground" aria-hidden /> : null}
      </div>
    </article>
  );
}
