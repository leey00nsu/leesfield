import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiKeyCard } from "@/features/api-key-management/ui/api-key-card";
import type { ApiKeyStatus } from "@/features/api-key-management/model/api-key-types";
import { AppCard } from "@/shared/ui/app-card";

type ApiKeyListItem = {
  id: string;
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedLabel: string;
  createdAtLabel: string;
  onEdit?: () => void;
};

type ApiKeyListProps = {
  items: ApiKeyListItem[];
  emptyMessage?: string;
};

export function ApiKeyList({
  items,
  emptyMessage,
}: ApiKeyListProps) {
  const t = useTranslations("apiKey.list");
  const resolvedEmptyMessage = emptyMessage ?? t("default");

  if (items.length === 0) {
    return (
      <AppCard
        variant="plain"
        className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[1.75rem] border-white/10 bg-[rgba(11,13,14,0.72)] px-6 text-center shadow-[0_22px_80px_rgba(0,0,0,0.22)]"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/35">
          <KeyRound className="h-6 w-6 text-white/38" />
        </div>
        <h3 className="text-lg font-semibold text-white">
          {t("emptyTitle")}
        </h3>
        <p className="text-sm text-white/42">
          {resolvedEmptyMessage}
        </p>
      </AppCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <ApiKeyCard
          key={item.id}
          name={item.name}
          maskedKey={item.maskedKey}
          status={item.status}
          lastUsedLabel={item.lastUsedLabel}
          createdAtLabel={item.createdAtLabel}
          onEdit={item.onEdit}
        />
      ))}
    </div>
  );
}
