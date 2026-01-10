import { CheckCircle2, Copy, Shield, Slash, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

import type { ApiKeyStatus } from "@/features/api-key-management/model/api-key-types";

type ApiKeyCardProps = {
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  lastUsedLabel: string;
  createdAtLabel: string;
  isPrimary?: boolean;
  onCopy?: () => void;
  onRevoke?: () => void;
};

const statusConfig = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    dot: "bg-green-500",
    text: "text-green-400",
  },
  revoked: {
    label: "Revoked",
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
  isPrimary = false,
  onCopy,
  onRevoke,
}: ApiKeyCardProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

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
            {isPrimary ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                Primary
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                config.text,
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {config.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border border-white/5 bg-black/50 px-2 py-1 text-xs font-mono text-gray-400">
              {maskedKey}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="rounded p-1 text-gray-500 transition-colors hover:text-white"
              aria-label="API 키 복사"
            >
              <Copy className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono text-gray-600">• Never shared</span>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-6 border-t border-white/5 pt-4 md:w-auto md:flex-row md:items-center md:gap-10 md:border-t-0 md:pt-0">
        <div className="flex min-w-[100px] flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Last Used
          </span>
          <span className="flex items-center gap-2 text-sm font-mono text-gray-200">
            <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
            {lastUsedLabel}
          </span>
        </div>
        <div className="flex min-w-[100px] flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Created
          </span>
          <span className="text-sm font-mono text-gray-400">
            {createdAtLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <button
            type="button"
            className="rounded-lg border border-transparent px-4 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onRevoke}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-accent-red transition-all hover:border-accent-red/20 hover:bg-accent-red/10"
            title="Revoke Key"
          >
            <Slash className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
