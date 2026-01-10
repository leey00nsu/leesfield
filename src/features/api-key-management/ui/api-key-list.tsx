import { KeyRound } from "lucide-react";
import { ApiKeyCard } from "@/features/api-key-management/ui/api-key-card";

type ApiKeyStatus = "active" | "revoked";

type ApiKeyListItem = {
  id: string;
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedLabel: string;
  createdAtLabel: string;
  isPrimary?: boolean;
};

type ApiKeyListProps = {
  items: ApiKeyListItem[];
  emptyMessage?: string;
};

export function ApiKeyList({
  items,
  emptyMessage = "API 키가 없습니다.",
}: ApiKeyListProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface-lighter">
          <KeyRound className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-200">Keys Empty</h3>
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <ApiKeyCard key={item.id} {...item} />
      ))}
    </div>
  );
}
