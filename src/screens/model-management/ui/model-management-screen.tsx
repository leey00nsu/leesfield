"use client";

import { useState } from "react";
import { Grid2X2, Image as ImageIcon, Video } from "lucide-react";
import {
  filterModelCatalog,
  modelCatalog,
  type ModelCatalogFilterType,
} from "@/features/model-management/model/model-catalog";
import { ModelList } from "@/features/model-management/ui/model-list";
import {
  PageHeader,
  PageHeaderSearchInput,
} from "@/shared/ui/page-header";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";

export function ModelManagementScreen() {
  const [type, setType] = useState<ModelCatalogFilterType>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const query = debouncedQuery.trim();
  const filteredModels = filterModelCatalog(modelCatalog, { type, query });

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">Model</span>{" "}
            <span className="text-primary">Management</span>
          </>
        }
        subtitle="FIND YOUR MODELS FAST"
        rightSlot={
          <PageHeaderSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="SEARCH_DATABASE..."
            filterButtonLabel="필터 옵션"
          />
        }
      >
        <DashboardFilterBar>
          <DashboardFilterToggle
            onClick={() => setType("all")}
            aria-pressed={type === "all"}
            active={type === "all"}
            icon={<Grid2X2 className="h-4 w-4" />}
          >
            All
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("image")}
            aria-pressed={type === "image"}
            active={type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            Images
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("video")}
            aria-pressed={type === "video"}
            active={type === "video"}
            icon={<Video className="h-4 w-4" />}
          >
            Videos
          </DashboardFilterToggle>
          <DashboardFilterDivider />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
            TOTAL: {filteredModels.length}
          </span>
        </DashboardFilterBar>
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        <ModelList
          items={filteredModels}
          emptyMessage={
            query ? "검색 결과가 없습니다." : "모델 카탈로그가 비어 있습니다."
          }
        />
      </div>
    </div>
  );
}
