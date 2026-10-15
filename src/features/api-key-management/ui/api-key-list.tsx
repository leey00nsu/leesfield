import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiKeyCard } from "@/features/api-key-management/ui/api-key-card";
import type { ApiKeyStatus } from "@/features/api-key-management/model/api-key-types";

import { AppResourceList, AppResourceEmpty } from "@/shared/ui/app-resource-list";

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
      <AppResourceEmpty icon={<KeyRound />} title={t("emptyTitle")} description={resolvedEmptyMessage} />
    );
  }

  return (
    <AppResourceList>
      {items.map((item) => (
        <div key={item.id} role="listitem">
        <ApiKeyCard
          name={item.name}
          maskedKey={item.maskedKey}
          status={item.status}
          lastUsedLabel={item.lastUsedLabel}
          createdAtLabel={item.createdAtLabel}
          onEdit={item.onEdit}
        />
        </div>
      ))}
    </AppResourceList>
  );
}
