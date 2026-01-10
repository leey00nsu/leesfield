import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import type { ApiKeyStatusFilter } from "@/features/api-key-management/model/use-api-key-management";
import {
  DashboardFilterBar,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type ApiKeyToolbarProps = {
  filter: ApiKeyStatusFilter;
  onFilterChange: (value: ApiKeyStatusFilter) => void;
  newKeyLabel: string;
  onNewKeyLabelChange: (value: string) => void;
  onGenerate: () => void;
  isIssuing: boolean;
};

export function ApiKeyToolbar({
  filter,
  onFilterChange,
  newKeyLabel,
  onNewKeyLabelChange,
  onGenerate,
  isIssuing,
}: ApiKeyToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <DashboardFilterBar className="gap-2">
        <DashboardFilterToggle
          onClick={() => onFilterChange("all")}
          aria-pressed={filter === "all"}
          active={filter === "all"}
          icon={<KeyRound className="h-4 w-4" />}
        >
          All Keys
        </DashboardFilterToggle>
        <DashboardFilterToggle
          onClick={() => onFilterChange("active")}
          aria-pressed={filter === "active"}
          active={filter === "active"}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          Active
        </DashboardFilterToggle>
        <DashboardFilterToggle
          onClick={() => onFilterChange("revoked")}
          aria-pressed={filter === "revoked"}
          active={filter === "revoked"}
          icon={<Slash className="h-4 w-4" />}
        >
          Revoked
        </DashboardFilterToggle>
      </DashboardFilterBar>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={newKeyLabel}
          onChange={(event) => onNewKeyLabelChange(event.target.value)}
          placeholder="NEW_KEY_LABEL..."
          className="h-10 w-full min-w-[220px] rounded-full border border-white/10 bg-surface-dark px-4 text-xs font-mono uppercase tracking-wider text-white placeholder:text-gray-600 focus:border-primary focus:outline-none focus:ring-0"
        />
        <Button
          type="button"
          onClick={onGenerate}
          disabled={isIssuing}
          variant="ghost"
          className={cn(
            "flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-wider text-black",
            "transition-colors hover:bg-white shadow-[0_0_20px_rgba(212,240,50,0.2)]",
            "whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary",
          )}
        >
          <Plus className="h-5 w-5" />
          {isIssuing ? "Generating..." : "Generate New Key"}
        </Button>
      </div>
    </div>
  );
}
