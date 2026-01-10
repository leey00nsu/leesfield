"use client";

import { useMemo, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Slash } from "lucide-react";
import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";
import {
  DashboardPageHeader,
  DashboardSearchInput,
} from "@/shared/ui/dashboard-page-header";
import {
  DashboardFilterBar,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";
import { cn } from "@/shared/lib/utils";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

type ApiKeyItem = {
  id: string;
  name: string;
  maskedKey: string;
  status: "active" | "revoked";
  lastUsedLabel: string;
  createdAtLabel: string;
  isPrimary?: boolean;
};

const mockKeys: ApiKeyItem[] = [
  {
    id: "prod-main",
    name: "Production_Main_App",
    maskedKey: "lf_live_8s9d...7h2k",
    status: "active",
    lastUsedLabel: "2 min ago",
    createdAtLabel: "JAN 02, 2026",
    isPrimary: true,
  },
  {
    id: "dev-test",
    name: "Development_Test_Env",
    maskedKey: "lf_live_4b2c...1k9p",
    status: "active",
    lastUsedLabel: "3 days ago",
    createdAtLabel: "DEC 18, 2025",
  },
  {
    id: "legacy-revoked",
    name: "Legacy_Partner",
    maskedKey: "lf_live_77ad...0qp1",
    status: "revoked",
    lastUsedLabel: "Revoked",
    createdAtLabel: "OCT 24, 2025",
  },
];

export function ApiKeyManagementScreen() {
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");

  const filteredKeys = useMemo(() => {
    const normalized = searchInput.trim().toLowerCase();
    return mockKeys.filter((item) => {
      if (filter !== "all" && item.status !== filter) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const target = `${item.name} ${item.maskedKey}`.toLowerCase();
      return target.includes(normalized);
    });
  }, [filter, searchInput]);

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <DashboardPageHeader
        title={
          <>
            <span className="text-white">API Key</span>{" "}
            <span className="text-primary">Management</span>
          </>
        }
        subtitle="SECURE ACCESS CONTROL // ACTIVE SESSION"
        rightSlot={
          <DashboardSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="SEARCH_KEYS..."
            filterButtonLabel="필터 옵션"
          />
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DashboardFilterBar className="gap-2">
            <DashboardFilterToggle
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              active={filter === "all"}
              icon={<KeyRound className="h-4 w-4" />}
            >
              All Keys
            </DashboardFilterToggle>
            <DashboardFilterToggle
              onClick={() => setFilter("active")}
              aria-pressed={filter === "active"}
              active={filter === "active"}
              icon={<ShieldCheck className="h-4 w-4" />}
            >
              Active
            </DashboardFilterToggle>
            <DashboardFilterToggle
              onClick={() => setFilter("revoked")}
              aria-pressed={filter === "revoked"}
              active={filter === "revoked"}
              icon={<Slash className="h-4 w-4" />}
            >
              Revoked
            </DashboardFilterToggle>
          </DashboardFilterBar>
          <button
            type="button"
            className={cn(
              "flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-wider text-black",
              "transition-colors hover:bg-white shadow-[0_0_20px_rgba(212,240,50,0.2)]",
            )}
          >
            <Plus className="h-5 w-5" />
            Generate New Key
          </button>
        </div>
      </DashboardPageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        <ApiKeyList
          items={filteredKeys}
          emptyMessage={
            searchInput ? "검색 결과가 없습니다." : "API 키가 없습니다."
          }
        />
      </div>
    </div>
  );
}
