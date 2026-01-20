import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiKeyCard } from "@/features/api-key-management/ui/api-key-card";
import type { ApiKeyStatus } from "@/features/api-key-management/model/api-key-types";

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
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter">
          <KeyRound className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-200">
          {t("emptyTitle")}
        </h3>
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {resolvedEmptyMessage}
        </p>
      </div>
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
