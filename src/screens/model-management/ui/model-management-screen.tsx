"use client";

import { useState } from "react";
import { Grid2X2, Image as ImageIcon, Video } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const tModel = useTranslations("model");
  const tCommonLabels = useTranslations("common.labels");
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
            <span className="text-white">{tModel("title.leading")}</span>{" "}
            <span className="text-primary">{tModel("title.accent")}</span>
          </>
        }
        subtitle={tModel("subtitle")}
        rightSlot={
          <PageHeaderSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={tCommonLabels("searchPlaceholder")}
            filterButtonLabel={tCommonLabels("filterOptions")}
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
            {tCommonLabels("all")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("image")}
            aria-pressed={type === "image"}
            active={type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            {tCommonLabels("images")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("video")}
            aria-pressed={type === "video"}
            active={type === "video"}
            icon={<Video className="h-4 w-4" />}
          >
            {tCommonLabels("videos")}
          </DashboardFilterToggle>
          <DashboardFilterDivider />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {tCommonLabels("total", { total: filteredModels.length })}
          </span>
        </DashboardFilterBar>
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">
        <ModelList
          items={filteredModels}
          emptyMessage={
            query ? tModel("empty.search") : tModel("empty.default")
          }
        />
      </div>
    </div>
  );
}
